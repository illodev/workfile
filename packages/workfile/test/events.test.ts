import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, sep } from "node:path";

import { buildBenchWorkspace } from "../scripts/bench-workspace.ts";
import {
    createWorkspaceWatcher,
    loadWorkspace,
    startProjectServer
} from "../dist/src/index.js";
import { stubWatch } from "./support/watch-stub.ts";

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

/** What the watcher hands to `onChange`. */
type Batch = { type: string; count: number; paths: string[] };

/** Waits for the quiet period to expire and the batch to be reported. */
async function flushed(batches: Batch[], limit = 5000) {
    for (let waited = 0; waited < limit && !batches.length; waited += 10) {
        await sleep(10);
    }
    // Longer than the quiet period, so a split that should not have happened
    // has time to show itself as a second batch rather than as nothing at all.
    await sleep(250);
}

/** Waits until every path has been reported, or the budget runs out. */
async function allReported(
    reported: Set<string>,
    paths: string[],
    limit = 20000
) {
    for (
        let waited = 0;
        waited < limit && paths.some((path) => !reported.has(path));
        waited += 25
    ) {
        await sleep(25);
    }
}

/**
 * Grouping, proven where it can be proven.
 *
 * The events are placed rather than written, so the assertions describe the
 * coalescer and nothing else, and the quiet period stays the one the product
 * ships — `startProjectServer` overrides none of these options.
 *
 * [[T-0179]]: the version of this that wrote forty files and asserted one batch
 * was timing the operating system while claiming to test the grouping. It was
 * widened from 250 ms to a full second on that reading and failed again at a
 * second, because the gaps it was fighting reach 4.8 s on a loaded Windows
 * runner and no width is enough. The loop below never yields, so no timer can
 * fire between two events however loaded the machine is: the burst is a burst
 * by construction rather than by luck.
 */
test("a burst is one batch, and one past the threshold says resynchronize", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-coalesce-"));
    try {
        await buildBenchWorkspace(root, "S");
        const workspace = await loadWorkspace({ root });
        const batches: Batch[] = [];
        const stub = stubWatch();
        const watcher = createWorkspaceWatcher(workspace, {
            onChange: (change) => batches.push(change),
            resetThreshold: 25,
            watch: stub.watch
        });

        const started = await watcher.start();
        assert.equal(started.mode, "watch", "the stub must let the watcher arm");
        try {
            // The cache holds locks that churn on every write, the persisted
            // index and agent activity. Watching it is a feedback loop, not a
            // source of events — and the proof is that the sweep placed no
            // handle inside it. The one path below the cache that is watched is
            // the probe's own directory, closed as soon as it answers.
            //
            // Two independent excludes reach it: the watcher's own
            // `storage.cache` and the `.project/.cache/**` in `docs.exclude`.
            // Removing either alone changes nothing, which is why this asserts
            // the outcome rather than the list.
            assert.deepEqual(
                stub.calls.filter(
                    (path) =>
                        path.includes(`${sep}.cache`) &&
                        !path.endsWith(`${sep}watch`)
                ),
                [],
                "the cache is excluded"
            );

            stub.deliver(".project/cards", "T-9001-one.md");
            stub.deliver(".project/cards", "T-9002-two.md");
            await flushed(batches);
            assert.equal(
                batches.length,
                1,
                "two events inside one quiet period are one batch"
            );
            assert.equal(batches[0].type, "changed");
            assert.deepEqual(batches[0].paths, [
                ".project/cards/T-9001-one.md",
                ".project/cards/T-9002-two.md"
            ]);

            // The temporary file `writeFileAtomic` creates alongside its target
            // must never surface: every protocol write makes one. Delivered
            // beside a real card, so the batch that proves it was dropped is a
            // batch that actually arrived.
            batches.length = 0;
            stub.deliver(".project/cards", ".abc123.tmp");
            stub.deliver(".project/cards", "T-9003-three.md");
            await flushed(batches);
            assert.deepEqual(
                batches.map((batch) => batch.paths),
                [[".project/cards/T-9003-three.md"]],
                "atomic-write temporaries are noise"
            );

            // Past the threshold a batch says "resynchronize" rather than
            // listing a thousand paths: a `git checkout` touching the corpus is
            // not something a consumer should try to apply record by record.
            batches.length = 0;
            for (let index = 0; index < 40; index += 1) {
                stub.deliver(
                    ".project/cards",
                    `T-95${String(index).padStart(2, "0")}-burst.md`
                );
            }
            await flushed(batches);
            assert.equal(batches.length, 1, "a burst coalesces into one batch");
            assert.equal(batches[0].type, "reset");
            assert.equal(batches[0].count, 40);
            assert.deepEqual(batches[0].paths, [], "a reset carries no list");
        } finally {
            watcher.close();
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * Delivery, which is the one part of this a stand-in cannot answer for.
 *
 * One non-recursive watch per directory, not a single recursive one: on a large
 * workspace the recursive call blocks the event loop for the better part of a
 * second doing a synchronous readdir, while placing individual watches over the
 * same tree costs single-digit milliseconds.
 *
 * Nothing here asserts a batch count. Whether forty writes arrive as one batch
 * or three is a fact about the runner's clock, and the grouping is settled
 * above with events this test places itself. What is asserted is the contract
 * the platform is actually responsible for: every write is reported, and no
 * noise ever is. So the two failures can no longer wear each other's name — if
 * this test fails the watcher lost a write, if the one above fails the
 * coalescer misgrouped.
 */
test("the watcher covers the corpus and reports no noise", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "workfile-watch-"));
    try {
        await buildBenchWorkspace(root, "S");
        const workspace = await loadWorkspace({ root });
        const batches: Batch[] = [];
        /** Every path reported over the whole test, so a straggler is seen. */
        const reported = new Set<string>();
        const watcher = createWorkspaceWatcher(workspace, {
            onChange: (change) => {
                batches.push(change);
                for (const path of change.paths) reported.add(path);
            }
        });

        const started = await watcher.start();
        if (started.mode !== "watch") {
            // Network filesystems and some container mounts never deliver.
            // Degrading is the designed behaviour, so this is not a failure.
            watcher.close();
            return;
        }
        assert.ok(started.watchedDirectories > 0);

        try {
            const one = ".project/cards/T-9001-one.md";
            await writeFile(join(root, one), card("T-9001"));
            await allReported(reported, [one]);
            assert.ok(reported.has(one), "a write into the corpus is reported");
            assert.equal(batches[0].type, "changed");

            // The atomic-write temporary and the cache are written before a
            // real card in the same directory: once that card is reported,
            // whatever the platform had to say about the other two has already
            // been said. Waiting a fixed interval instead would pass while the
            // events were merely still in flight.
            const two = ".project/cards/T-9002-two.md";
            await writeFile(join(root, ".project/cards/.abc123.tmp"), "x");
            await writeFile(join(root, ".project/.cache/scratch.md"), "x");
            await writeFile(join(root, two), card("T-9002"));
            await allReported(reported, [two]);
            assert.ok(reported.has(two), "a write after noise is still reported");

            // A burst. How it is grouped is the runner's business; that all
            // forty arrive is the watcher's.
            batches.length = 0;
            const burst: string[] = [];
            const stamps: number[] = [];
            for (let index = 0; index < 40; index += 1) {
                const id = `T-95${String(index).padStart(2, "0")}`;
                const path = `.project/cards/${id}-burst.md`;
                burst.push(path);
                await writeFile(join(root, path), card(id));
                stamps.push(Date.now());
            }
            await allReported(reported, burst);
            const widest = Math.max(
                ...stamps.slice(1).map((at, index) => at - stamps[index])
            );
            const missing = burst.filter((path) => !reported.has(path));
            assert.deepEqual(
                missing,
                [],
                `the watcher never reported ${missing.length} of 40 writes; the widest gap between two of them was ${widest}ms`
            );
            t.diagnostic(
                `burst on ${process.platform} node ${process.versions.node}: 40 writes, widest gap ${widest}ms, ${batches.length} batch(es)`
            );

            // Asserted last, so a slow platform has had the whole burst to
            // contradict it.
            assert.deepEqual(
                [...reported].filter(
                    (path) =>
                        path.startsWith(".project/.cache/") ||
                        basename(path).startsWith(".")
                ),
                [],
                "atomic-write temporaries and the cache are not events"
            );

            // Reported, not asserted. Both counters stay at zero on Linux —
            // measured, not assumed: deleting a watched directory reports
            // `rename` with a name and never fires `error`, and 20 000 writes
            // produced 40 000 events with none missing a name. Windows uses
            // ReadDirectoryChangesW and is expected to differ, and this line is
            // how that gets observed on the runner instead of guessed at from
            // here. [[T-0113]] is the card waiting on it.
            t.diagnostic(
                `fs.watch signals dropped on ${process.platform}: ${JSON.stringify(watcher.dropped)}`
            );
        } finally {
            watcher.close();
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * The delivery budget, measured rather than guessed.
 *
 * 239 samples of this test across 40 commits and six runner configurations,
 * harvested from CI logs under T-0166:
 *
 *   macos            p50  284   p90  350   max  544
 *   ubuntu           p50  380   p90  422   max  481
 *   windows node 22  p50  435   p90  714   max 1208
 *   windows node 24  p50  595   p90 1105   max 1632
 *
 * 2000 ms is about four times the worst ever seen on macOS and Linux, and 1.2
 * times the worst on Windows — which is why it fired once at 2243 ms, on a
 * commit whose diff was scripts, media and Markdown. That observation ranks
 * above all 79 Windows samples: contention on one occasion, not a regression
 * in delivery.
 *
 * Windows gets its own number for a measured reason rather than a folk one,
 * and Node 24 is where the tail lives — slower than Node 22 on 62% of the
 * commits both ran, by a median of 90 ms and a worst case of 1219 ms.
 *
 * Loose enough to mean something when it fires: a budget that trips on
 * contention teaches everyone to re-run until green, and T-0109 already wrote
 * down what that costs. It still catches the regression it exists for, because
 * a watcher that falls back to polling delivers in seconds, not in one.
 */
const DELIVERY_BUDGET_MS = process.platform === "win32" ? 4000 : 2000;

test("the SSE channel reports writes made outside the server", async (t) => {
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
        // Twice the budget, so an event that is late is still observed as
        // late. A loop that gave up at the budget would report every late
        // delivery as a lost one, and those two have nothing in common.
        const window = DELIVERY_BUDGET_MS * 2;
        const deadline = started + window;
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
                : `no records.changed in ${window}ms — the event never arrived rather than arriving late (watcher: ${watching.mode}, ${watching.directories} directories; frames seen: ${stream.frames.map((frame) => frame.type).join(", ") || "none"}; stream: ${stream.failure ? `died with ${stream.failure}` : "open"})`
        );
        const [event] = changes;
        assert.deepEqual(event.data.paths, [
            ".project/cards/T-9100-external.md"
        ]);
        assert.ok(event.data.epoch > 0, "the index was invalidated");
        // Emitted on every run, pass or fail, so the next person setting this
        // number greps one line instead of parsing two reporter formats out of
        // six job logs. Node 22 defaults to TAP off a TTY and Node 23+ to spec,
        // which is what made the first measurement of this budget expensive.
        t.diagnostic(
            `SSE delivery: ${elapsed}ms on ${process.platform} node ${process.versions.node} (budget ${DELIVERY_BUDGET_MS}ms)`
        );
        assert.ok(
            elapsed < DELIVERY_BUDGET_MS,
            `the event took ${elapsed}ms against a ${DELIVERY_BUDGET_MS}ms budget on ${process.platform}; this is meant to feel immediate`
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
