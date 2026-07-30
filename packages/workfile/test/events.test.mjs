import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildBenchWorkspace } from "../scripts/bench-workspace.mjs";
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
        } catch {
            // Cancelled with the test.
        }
    })();
    return { frames, cancel: () => reader.cancel().catch(() => undefined), pump };
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
        await sleep(200);

        // `hello` first, so a reconnecting client can tell "same process" from
        // "restarted process whose ids began again".
        assert.equal(stream.frames[0]?.type, "hello");
        assert.ok(stream.frames[0].data.serverId);

        // The point of the whole exercise: a write nobody told the server about
        // — the CLI, an agent over MCP, git, an editor — reaches the browser.
        stream.frames.length = 0;
        const started = Date.now();
        await writeFile(
            join(root, ".project/cards/T-9100-external.md"),
            card("T-9100")
        );

        for (let waited = 0; waited < 3000 && !stream.frames.length; waited += 50) {
            await sleep(50);
        }
        const elapsed = Date.now() - started;

        const changes = stream.frames.filter(
            (frame) => frame.type === "records.changed"
        );
        assert.equal(changes.length, 1, "one write, one records.changed");
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
