import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    lockIsStale,
    mapWithConcurrency,
    isResourceExhaustion,
    readLockOwner,
    withFileLock
} from "../dist/src/index.js";

// The lock file has always recorded who holds it. Nothing ever read it, so a
// lock left behind by a SIGKILL blocked every future write to that record —
// from the CLI, the HTTP API and MCP alike — indefinitely, while `doctor`
// reported no problem at all.
test("a lock whose owner is gone is broken instead of blocking forever", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-locks-"));
    const path = join(root, "locks", "T-0001.lock");
    try {
        await mkdir(join(root, "locks"), { recursive: true });
        // A pid that cannot be running: the highest value is exclusive.
        await writeFile(
            path,
            `${JSON.stringify({
                pid: 2 ** 22,
                createdAt: new Date().toISOString(),
                recordId: "T-0001"
            })}\n`
        );

        const owner = await readLockOwner(path);
        assert.equal(owner.pid, 2 ** 22);
        assert.equal(owner.metadata.recordId, "T-0001");

        const verdict = await lockIsStale(path);
        assert.equal(verdict.stale, true);
        assert.equal(verdict.reason, "owner-process-gone");

        const broken = [];
        const started = Date.now();
        const result = await withFileLock(path, async () => "written", {
            timeoutMs: 2000,
            onBrokenLock: (event) => broken.push(event)
        });
        assert.equal(result, "written");
        assert.ok(
            Date.now() - started < 1000,
            "breaking a dead lock must not wait out the timeout"
        );
        assert.equal(broken.length, 1);
        assert.equal(broken[0].reason, "owner-process-gone");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a lock held by a live process is respected and reported", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-locks-live-"));
    const path = join(root, "locks", "T-0002.lock");
    try {
        await mkdir(join(root, "locks"), { recursive: true });
        // This very process is alive by definition.
        await writeFile(
            path,
            `${JSON.stringify({
                pid: process.pid,
                createdAt: new Date().toISOString(),
                recordId: "T-0002"
            })}\n`
        );

        assert.equal((await lockIsStale(path)).stale, false);
        await assert.rejects(
            () => withFileLock(path, async () => "nope", { timeoutMs: 100 }),
            (error) => {
                assert.equal(error.code, "WRITE_LOCK_TIMEOUT");
                // The timeout used to say only that "another process" had it,
                // with no way to find out which one.
                assert.equal(error.details.owner.recordId, "T-0002");
                assert.equal(typeof error.details.heldForMs, "number");
                return true;
            }
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("an ancient lock expires even when its pid was reused", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-locks-old-"));
    const path = join(root, "locks", "T-0003.lock");
    try {
        await mkdir(join(root, "locks"), { recursive: true });
        await writeFile(
            path,
            `${JSON.stringify({
                pid: process.pid,
                createdAt: new Date(Date.now() - 86_400_000).toISOString()
            })}\n`
        );
        const verdict = await lockIsStale(path, { staleAfterMs: 60_000 });
        assert.equal(verdict.stale, true);
        assert.equal(verdict.reason, "expired");
        assert.equal(await withFileLock(path, async () => "ok"), "ok");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("the lock file is removed once the operation finishes", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-locks-clean-"));
    const path = join(root, "locks", "T-0004.lock");
    try {
        await withFileLock(path, async () => {
            // Visible while held, so the metadata is there to be read.
            const held = JSON.parse(await readFile(path, "utf8"));
            assert.equal(held.pid, process.pid);
        });
        await assert.rejects(() => readFile(path, "utf8"));

        // A throwing operation must still release.
        await assert.rejects(
            () =>
                withFileLock(path, async () => {
                    throw new Error("boom");
                }),
            /boom/
        );
        await assert.rejects(() => readFile(path, "utf8"));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// `Promise.all(items.map(...))` opened one descriptor per record. Where the
// hard limit is low, that raises EMFILE — and every caller's catch recorded it
// as an unreadable *file*, so the index came back short and silent.
test("the I/O pool bounds concurrency and preserves order", async () => {
    let live = 0;
    let peak = 0;
    const items = Array.from({ length: 200 }, (_, index) => index);
    const results = await mapWithConcurrency(
        items,
        async (item) => {
            live += 1;
            peak = Math.max(peak, live);
            await new Promise((done) => setTimeout(done, 1));
            live -= 1;
            return item * 2;
        },
        { concurrency: 8 }
    );

    assert.equal(peak, 8, `peak concurrency was ${peak}`);
    assert.equal(results.length, 200);
    assert.deepEqual(results.slice(0, 4), [0, 2, 4, 6]);
    assert.deepEqual(
        results,
        items.map((item) => item * 2),
        "results must keep input order"
    );
});

test("resource exhaustion is told apart from a broken record", () => {
    for (const code of ["EMFILE", "ENFILE", "ENOMEM"]) {
        assert.equal(isResourceExhaustion(Object.assign(new Error(code), { code })), true);
    }
    for (const code of ["ENOENT", "EACCES", undefined]) {
        assert.equal(
            isResourceExhaustion(Object.assign(new Error("x"), { code })),
            false
        );
    }
});
