import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createWorkspaceWatcher, loadWorkspace } from "../dist/src/index.js";
import { stubWatch, watched } from "./support/watch-stub.ts";

const fixture = resolve(
    fileURLToPath(new URL("./fixtures/workspace", import.meta.url))
);

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function startWatcher(root: string, stub: any, options: any = {}) {
    const workspace = await loadWorkspace({ root });
    const states: any[] = [];
    const changes: any[] = [];
    const watcher = createWorkspaceWatcher(workspace, {
        watch: stub.watch,
        onChange: (change: any) => changes.push(change),
        onState: (state: any) => states.push(state),
        debounceMs: 5,
        ...options
    });
    const started = await watcher.start();
    assert.equal(started.mode, "watch", "the stub must let the watcher arm");
    return { watcher, states, changes, started };
}

test("a handle error on a directory that is still there re-establishes the watch", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-watch-recover-"));
    try {
        await cp(fixture, root, { recursive: true });
        const stub = stubWatch();
        const { watcher, states, changes, started } = await startWatcher(root, stub);
        try {
            const cards = watched(stub, ".project/cards");
            const before = stub.calls.filter((path) => path === cards).length;
            assert.equal(before, 1);

            stub.handles.get(cards).emit("error", new Error("handle died"));
            await sleep(100);

            assert.equal(
                stub.calls.filter((path) => path === cards).length,
                2,
                "the directory has to be watched again, not dropped"
            );
            assert.equal(watcher.mode, "watch");
            assert.equal(watcher.watchedDirectories, started.watchedDirectories);
            assert.equal(watcher.dropped.errors, 1);
            // Whatever happened while it was unwatched was never delivered, so
            // a consumer that trusts the stream is now behind.
            assert.deepEqual(
                changes.map((change) => change.type),
                ["reset"]
            );
            assert.deepEqual(states, [], "recovering is not a state change");
        } finally {
            watcher.close();
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a directory that cannot be re-established stops the watcher claiming watch", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-watch-degrade-"));
    try {
        await cp(fixture, root, { recursive: true });
        const stub = stubWatch();
        const { watcher, states } = await startWatcher(root, stub);
        try {
            const cards = watched(stub, ".project/cards");
            // Still on disk, so this is a broken promise rather than a
            // directory with nothing left to say.
            stub.failOn.add(cards);
            stub.handles.get(cards).emit("error", new Error("handle died"));
            await sleep(100);

            assert.equal(
                watcher.mode,
                "unavailable",
                "a watcher that cannot cover the tree must not claim it does"
            );
            // And it has to say so: the interface stops polling on `watch` and
            // `watch.state` is published once, at start.
            assert.deepEqual(
                states.map((state) => state.mode),
                ["unavailable"]
            );
        } finally {
            watcher.close();
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a directory that is simply gone is dropped without a word", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-watch-gone-"));
    try {
        await cp(fixture, root, { recursive: true });
        const stub = stubWatch();
        const { watcher, states, changes } = await startWatcher(root, stub);
        try {
            const docs = watched(stub, ".project/cards/archive");
            await rm(docs, { recursive: true, force: true });
            const before = stub.calls.length;
            stub.handles.get(docs).emit("error", new Error("handle died"));
            await sleep(100);

            assert.equal(stub.calls.length, before, "nothing to re-watch");
            assert.equal(
                watcher.mode,
                "watch",
                "a deleted directory has nothing left to report and is not a failure"
            );
            assert.deepEqual(changes, []);
            assert.deepEqual(states, []);
        } finally {
            watcher.close();
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a handle that keeps failing is retried a bounded number of times", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-watch-flap-"));
    try {
        await cp(fixture, root, { recursive: true });
        const stub = stubWatch();
        const { watcher, states } = await startWatcher(root, stub);
        try {
            const cards = watched(stub, ".project/cards");
            // Every re-established handle dies immediately: without a bound
            // this is an infinite loop rather than a recovery.
            for (let round = 0; round < 12; round += 1) {
                stub.handles.get(cards)?.emit("error", new Error("again"));
                await sleep(30);
            }

            const attempts = stub.calls.filter((path) => path === cards).length;
            assert.ok(
                attempts <= 5,
                `the retry has to be bounded; watched ${attempts} times`
            );
            assert.equal(watcher.mode, "unavailable");
            assert.deepEqual(
                states.map((state) => state.mode),
                ["unavailable"],
                "and it must say so once, not once per failure"
            );
        } finally {
            watcher.close();
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
