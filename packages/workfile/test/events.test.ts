import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildBenchWorkspace } from "../scripts/bench-workspace.ts";
import {
    createWorkspaceWatcher,
    loadWorkspace,
    startProjectServer
} from "../dist/src/index.js";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function card(id) {
    return [
        "---",
        `id: ${id}`,
        `title: Card ${id}`,
        "status: backlog",
        "type: task",
        "priority: low",
        "area: core",
        "created: 2026-07-30",
        "updated: 2026-07-30",
        "---",
        "",
        "Body.",
        ""
    ].join("\n");
}

/** Collects SSE frames from a live stream. */
function readStream(response) {
    const frames = [];
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let failure = null;
    const pump = (async () => {
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let split;
                while ((split = buffer.indexOf("\n\n")) !== -1) {
                    const raw = buffer.slice(0, split);
                    buffer = buffer.slice(split + 2);
                    if (raw.startsWith(":")) continue;
                    const frame = {};
                    for (const line of raw.split("\n")) {
                        const [key, ...rest] = line.split(":");
                        frame[key.trim()] = rest.join(":").trim();
                    }
                    frames.push({
                        id: frame.id,
                        type: frame.event,
                        data: frame.data ? JSON.parse(frame.data) : null
                    });
                }
            }
        } catch (error) {
            // Usually the cancellation at the end of the test. But a socket
            // that died on its own leaves the stream deaf, which looks exactly
            // like a watcher that never fired — so keep it rather than let one
            // failure wear the other's name.
            failure = error;
        }
    })();
    return {
        frames,
        get failure() {
            return failure;
        },
        cancel: () => reader.cancel().catch(() => undefined),
        pump
    };
}

/**
 * Waits until the server's watcher is actually watching.
 *
 * The server starts it lazily on the first subscriber and does not await it —
 * `void ensureWatching()` answers the request while `start()` is still
 * probing the platform and placing handles. Until the handle on
 * `.project/cards` exists `fs.watch` has nothing to report, so a write into
 * that directory is not delivered late, it is lost: there is no catch-up for
 * a write that preceded the watch. Waiting a fixed 200 ms here was a guess at
 * how long that takes, and on a loaded runner it is not enough.
 *
 * `mode` is the wrong signal — it reads "watch" from construction and only
 * ever degrades, so it answers "did the probe fail", not "is the watcher up".
 * The handle count is the one that becomes true only once start() has run.
 */
async function watcherReady(url, limit = 10000) {
    for (let waited = 0; waited < limit; waited += 25) {
        const metrics = (await fetch(`${url}/api/v2/metrics`).then((result) =>
            result.json()
        )) as { watcher: { mode: string; directories: number } };
        if (
            metrics.watcher.directories > 0 ||
            metrics.watcher.mode === "unavailable"
        ) {
            return metrics.watcher;
        }
        await sleep(25);
    }
    return null;
}

// One non-recursive watch per directory, not a single recursive one: on a large
// workspace the recursive call blocks the event loop for the better part of a
// second doing a synchronous readdir, while placing individual watches over the
// same tree costs single-digit milliseconds.
test("the watcher covers the corpus, coalesces bursts and ignores the cache", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-watch-"));
    try {
        await buildBenchWorkspace(root, "S");
        const workspace = await loadWorkspace({ root });
        const batches = [];
        // Windows runners deliver a burst's events with gaps that were
        // observed to exceed 850 ms — a 250 ms quiet period still split one
        // burst into two batches there. Splitting a batch now requires a
        // full second of silence: coalescing is the behavior under test,
        // not the latency budget, so the windows are wide on purpose.
        const watcher = createWorkspaceWatcher(workspace, {
            onChange: (change) => batches.push(change),
            resetThreshold: 25,
            debounceMs: 1000,
            maxDebounceMs: 10000
        });
        const nextBatch = async (limit = 10000) => {
            for (let waited = 0; waited < limit && !batches.length; waited += 50) {
                await sleep(50);
            }
            // The quiet period plus slack, so a straggler event that would
            // have opened a second batch has had its chance to arrive.
            await sleep(1600);
        };

        const started = await watcher.start();
        if (started.mode !== "watch") {
            // Network filesystems and some container mounts never deliver.
            // Degrading is the designed behaviour, so this is not a failure.
            watcher.close();
            return;
        }
        assert.ok(started.watchedDirectories > 0);

        try {
            await writeFile(
                join(root, ".project/cards/T-9001-one.md"),
                card("T-9001")
            );
            await nextBatch();
            assert.equal(batches.length, 1, "one write, one batch");
            assert.equal(batches[0].type, "changed");
            assert.deepEqual(batches[0].paths, [
                ".project/cards/T-9001-one.md"
            ]);

            // The temporary file `writeFileAtomic` creates alongside its target
            // must never surface: every protocol write makes one.
            batches.length = 0;
            await writeFile(join(root, ".project/cards/.abc123.tmp"), "x");
            await sleep(1400);
            assert.deepEqual(batches, [], "atomic-write temporaries are noise");

            // Neither may the cache, which holds locks that churn on every
            // write, the persisted index, and agent activity. Watching it is a
            // feedback loop, not a source of events.
            await writeFile(join(root, ".project/.cache/scratch.md"), "x");
            await sleep(1400);
            assert.deepEqual(batches, [], "the cache is excluded");

            // A burst reports once, and past a threshold says "resynchronize"
            // rather than listing a thousand paths.
            batches.length = 0;
            for (let index = 0; index < 40; index += 1) {
                await writeFile(
                    join(root, `.project/cards/T-95${String(index).padStart(2, "0")}-burst.md`),
                    card(`T-95${String(index).padStart(2, "0")}`)
                );
            }
            await nextBatch(15000);
            assert.equal(batches.length, 1, "a burst coalesces into one batch");
            assert.equal(batches[0].type, "reset");
            assert.ok(batches[0].count >= 40);
            assert.deepEqual(batches[0].paths, [], "a reset carries no list");
        } finally {
            watcher.close();
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("the SSE channel reports writes made outside the server", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-sse-"));
    await buildBenchWorkspace(root, "S");
    const workspace = await loadWorkspace({ root });
    const running = await startProjectServer(workspace, { port: 0 });
    let stream;

    try {
        const response = await fetch(`${running.url}/api/v2/events`);
        assert.equal(response.status, 200);
        assert.match(
            response.headers.get("content-type"),
            /^text\/event-stream/
        );
        assert.equal(response.headers.get("cache-control"), "no-cache");
        // Buffering proxies would defeat the whole point.
        assert.equal(response.headers.get("x-accel-buffering"), "no");

        stream = readStream(response);
        for (let waited = 0; waited < 3000 && !stream.frames.length; waited += 25) {
            await sleep(25);
        }

        // `hello` first, so a reconnecting client can tell "same process" from
        // "restarted process whose ids began again".
        assert.equal(stream.frames[0]?.type, "hello");
        assert.ok(stream.frames[0].data.serverId);

        // Synchronize on the watcher rather than guessing at it: a write made
        // before the handle exists is lost, not slow, and that is what made
        // this test flaky on the Windows runner.
        const watching = await watcherReady(running.url);
        assert.ok(watching, "the watcher never came up");
        if (watching.mode !== "watch") {
            // Network filesystems and some container mounts never deliver.
            // Degrading is the designed behaviour, so this is not a failure.
            return;
        }

        // The point of the whole exercise: a write nobody told the server about
        // — the CLI, an agent over MCP, git, an editor — reaches the browser.
        stream.frames.length = 0;
        const started = Date.now();
        await writeFile(
            join(root, ".project/cards/T-9100-external.md"),
            card("T-9100")
        );

        // Waiting for the frame under test rather than for any frame at all:
        // the two events are published back to back, so exiting on the first
        // one to arrive can leave `records.changed` unparsed and report zero
        // when the channel is in fact working.
        const seen = (type) =>
            stream.frames.some((frame) => frame.type === type);
        let arrivedAt = 0;
        const deadline = started + 3000;
        while (Date.now() < deadline) {
            if (!arrivedAt && seen("records.changed")) arrivedAt = Date.now();
            if (arrivedAt && seen("activity.changed")) break;
            await sleep(25);
        }
        // A frame that lands between the loop's last look and the filter below
        // still counts, but it cannot be allowed to report as instant: with no
        // observation of its own it is charged the whole window it outlasted.
        const elapsed = (arrivedAt || Date.now()) - started;

        const changes = stream.frames.filter(
            (frame) => frame.type === "records.changed"
        );
        // A failure has to say which of the two it is, because they have
        // nothing in common: a missing event is a dropped watch, a late one is
        // a loaded runner.
        assert.equal(
            changes.length,
            1,
            arrivedAt
                ? `one write, one records.changed; got ${changes.length}`
                : `no records.changed in 3000ms — the event never arrived rather than arriving late (watcher: ${watching.mode}, ${watching.directories} directories; frames seen: ${stream.frames.map((frame) => frame.type).join(", ") || "none"}; stream: ${stream.failure ? `died with ${stream.failure}` : "open"})`
        );
        const [event] = changes;
        assert.deepEqual(event.data.paths, [
            ".project/cards/T-9100-external.md"
        ]);
        assert.ok(event.data.epoch > 0, "the index was invalidated");
        assert.ok(
            elapsed < 2000,
            `the event took ${elapsed}ms; this is meant to feel immediate`
        );

        // The event is an invalidation, not the record: the client fetches what
        // it needs, so a body never travels down the channel.
        assert.equal("body" in event.data, false);

        // A card write also moves the presence picture, because claims live in
        // card frontmatter — and that is a separate channel so a view showing
        // only presence need not refetch records to notice.
        assert.ok(
            stream.frames.some((frame) => frame.type === "activity.changed"),
            "a card write announces activity too"
        );

        // And the change really is visible through the API afterwards.
        const listed = await fetch(`${running.url}/api/tasks`).then((result) =>
            result.json()
        );
        assert.ok(listed.tasks.some((task) => task.id === "T-9100"));
    } finally {
        await stream?.cancel();
        await running.close();
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * An open stream and a stream that can deliver are different things.
 *
 * The watcher starts on the first subscriber and is not awaited, so `hello`
 * goes out while it is still arming — and it can finish unable to deliver at
 * all, which is the designed behaviour on a network filesystem. The interface
 * stops polling the moment `hello` arrives, so for as long as the frame said
 * nothing about the watcher, a workspace `fs.watch` is silent about left the
 * board permanently still: no stream, no poll, and nothing on screen saying so.
 */
test("the stream says whether it can deliver, not only that it is open", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-ready-"));
    await buildBenchWorkspace(root, "S");
    const workspace = await loadWorkspace({ root });
    const running = await startProjectServer(workspace, { port: 0 });
    let first;
    let second;

    try {
        first = readStream(await fetch(`${running.url}/api/v2/events`));
        for (let waited = 0; waited < 3000 && !first.frames.length; waited += 25) {
            await sleep(25);
        }
        // The first subscriber is the one that starts it, so it cannot be told
        // anything better than "not yet".
        assert.equal(first.frames[0]?.type, "hello");
        assert.equal(first.frames[0].data.watcher.mode, "pending");

        const watching = await watcherReady(running.url);
        assert.ok(watching, "the watcher never came up");
        if (watching.mode !== "watch") return;

        // And it is told when that changes, rather than having to poll for it.
        for (let waited = 0; waited < 3000; waited += 25) {
            if (first.frames.some((frame) => frame.type === "watch.state")) break;
            await sleep(25);
        }
        const settled = first.frames.find(
            (frame) => frame.type === "watch.state"
        );
        assert.ok(settled, "the watcher settling is announced");
        assert.equal(settled.data.mode, "watch");
        assert.ok(settled.data.directories > 0);

        // A client arriving later gets the answer in `hello` itself.
        second = readStream(await fetch(`${running.url}/api/v2/events`));
        for (let waited = 0; waited < 3000 && !second.frames.length; waited += 25) {
            await sleep(25);
        }
        assert.equal(second.frames[0].data.watcher.mode, "watch");
    } finally {
        await first?.cancel();
        await second?.cancel();
        await running.close();
        await rm(root, { recursive: true, force: true });
    }
});

// The probe asks whether one notification arrived inside half a second, which
// a loaded machine can fail on a filesystem that works — and the answer used to
// be cached for the life of the process, so a bad half second turned push off
// until the server was restarted.
test("a watcher that came up unable to deliver is tried again", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-retry-"));
    await buildBenchWorkspace(root, "S");
    // A file where the probe wants its directory, so `mkdir` fails and the
    // watcher decides the platform does not deliver. Chosen over revoking
    // permissions because that is a no-op on the Windows runner.
    const inTheWay = join(root, ".project/.cache/watch");
    await mkdir(join(root, ".project/.cache"), { recursive: true });
    await writeFile(inTheWay, "in the way");

    const workspace = await loadWorkspace({ root });
    const running = await startProjectServer(workspace, {
        port: 0,
        watchRetryMs: 200
    });

    try {
        await fetch(`${running.url}/api/v2/events`).then((response) =>
            response.body?.cancel()
        );
        const failed = await watcherReady(running.url);
        assert.equal(failed?.mode, "unavailable", "the probe was refused");

        // The obstacle goes away, as a busy machine becomes quiet again.
        await rm(inTheWay, { force: true });
        await sleep(250);

        await fetch(`${running.url}/api/v2/events`).then((response) =>
            response.body?.cancel()
        );
        // Not `watcherReady`: it answers as soon as the mode is settled, and
        // the mode reads "unavailable" from the failed attempt until the retry
        // finishes. The handle count is what says the retry succeeded.
        let recovered: { mode: string; directories: number } | null = null;
        for (let waited = 0; waited < 10000; waited += 25) {
            const metrics = (await fetch(`${running.url}/api/v2/metrics`).then(
                (response) => response.json()
            )) as { watcher: { mode: string; directories: number } };
            if (metrics.watcher.directories > 0) {
                recovered = metrics.watcher;
                break;
            }
            await sleep(25);
        }
        assert.ok(recovered, "a later subscriber tries again");
        assert.equal(recovered.mode, "watch");
    } finally {
        await running.close();
        await rm(root, { recursive: true, force: true });
    }
});
