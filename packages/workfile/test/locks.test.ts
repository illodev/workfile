import assert from "node:assert/strict";
import test from "node:test";
import {
    mkdtemp,
    open as openFile,
    readFile,
    rm,
    writeFile,
    mkdir
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    isCreateContention,
    lockIsStale,
    mapWithConcurrency,
    isResourceExhaustion,
    readLockOwner,
    withFileLock
} from "../dist/src/index.js";

/** The failure Windows reports where POSIX reports EEXIST. */
function refusal(code: string, path: string) {
    return Object.assign(
        new Error(`${code}: operation not permitted, open '${path}'`),
        { code, path, syscall: "open" }
    );
}

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

/**
 * Windows refuses to create a file whose last handle is still closing, and it
 * refuses with `EPERM` rather than with `EEXIST`. The lock loop only knew the
 * POSIX code, so the other one fell through to `throw error` and surfaced as
 * `INTERNAL_ERROR` — a card creation failing outright where it should have
 * waited its turn.
 *
 * The opener is injected because this cannot be reproduced by racing: it took
 * four processes, a 500-record corpus and ten rounds to happen once on a
 * Windows runner, and it did not happen at all on the Node 24 matrix of the
 * same run. Waiting for a runner to lose that race again is not a test.
 */
test("a lock refused with EPERM is waited out, not reported as a fault", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-locks-eperm-"));
    const path = join(root, "locks", "T-0005.lock");
    try {
        let attempts = 0;
        const result = await withFileLock(path, async () => "written", {
            retryMs: 1,
            timeoutMs: 2000,
            open: async (target: string, flags: string) => {
                attempts += 1;
                if (attempts <= 3) throw refusal("EPERM", target);
                return openFile(target, flags);
            }
        });

        assert.equal(result, "written");
        assert.equal(attempts, 4, "each refusal must cost one retry, no more");
        await assert.rejects(
            () => readFile(path, "utf8"),
            "the lock is still released once the operation finishes"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a lock that is never grantable gives up naming the contention", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-locks-forever-"));
    const path = join(root, "locks", "T-0006.lock");
    try {
        const started = Date.now();
        await assert.rejects(
            () =>
                withFileLock(path, async () => "nope", {
                    timeoutMs: 120,
                    retryMs: 5,
                    open: async (target: string) => {
                        throw refusal("EPERM", target);
                    }
                }),
            (error: any) => {
                assert.equal(error.code, "WRITE_LOCK_TIMEOUT");
                // Without this the report is "operation not permitted", which
                // reads as a broken installation rather than as a queue.
                assert.equal(error.details.lastError, "EPERM");
                return true;
            }
        );
        assert.ok(
            Date.now() - started < 2000,
            "the retry has to be bounded by the timeout, not by the errno"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("contention is told apart from a directory that is not writable", () => {
    for (const code of ["EEXIST", "EPERM", "EBUSY"]) {
        assert.equal(isCreateContention(refusal(code, "x")), true, code);
    }
    for (const code of ["ENOENT", "EROFS", "EISDIR", "ENOSPC"]) {
        assert.equal(isCreateContention(refusal(code, "x")), false, code);
    }
    assert.equal(isCreateContention(new Error("no code")), false);
    assert.equal(isCreateContention(null), false);
    // EACCES is the ordinary POSIX "not yours to write in" and must stay a
    // fault there; on Windows it is one more way of saying delete-pending.
    assert.equal(
        isCreateContention(refusal("EACCES", "x")),
        process.platform === "win32"
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
