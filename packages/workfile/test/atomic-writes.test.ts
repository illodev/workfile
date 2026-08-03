import assert from "node:assert/strict";
import test from "node:test";
import {
    chmod,
    mkdtemp,
    open,
    readFile,
    readdir,
    rm,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { isRenameRefusal, writeFileAtomic } from "../dist/src/index.js";

/**
 * Measured on the Windows runners, both Node 22 and 24, by holding the
 * destination and watching what `writeFileAtomic` did:
 *
 *     node reader (fs.open r)          EPERM rename
 *     outside share=None               EPERM rename
 *     outside share=Read               EPERM rename
 *     outside share=ReadWrite, Delete  EPERM rename
 *     after release (every case)       ok after ~100ms
 *     destination read-only            EPERM rename
 *
 * Three things came out of that. A reader opened by this very process is
 * enough, so the exposure is the product's own index builder, watcher, HTTP
 * server and UI reading the records the CLI writes — not just editors and
 * scanners. The share mode makes no difference at all, so nothing can be
 * fixed by opening files more politely. And the permanent case reports the
 * identical code, which is why waiting cannot be the whole answer.
 */
function refusal(code: string) {
    return Object.assign(new Error(`${code}: operation not permitted, rename`), {
        code,
        syscall: "rename"
    });
}

test("a rename refused while somebody reads the destination is waited out", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-atomic-"));
    const path = join(root, "record.md");
    try {
        await writeFile(path, "first\n");
        let refusals = 0;
        await writeFileAtomic(path, "second\n", {
            retryMs: 1,
            rename: async (from: string, to: string) => {
                refusals += 1;
                if (refusals <= 3) throw refusal("EPERM");
                const { rename } = await import("node:fs/promises");
                return rename(from, to);
            }
        });

        assert.equal(refusals, 4);
        assert.equal(await readFile(path, "utf8"), "second\n");
        assert.deepEqual(
            await readdir(root),
            ["record.md"],
            "the temporary file must not survive the retries"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a destination held forever fails with its own errno, bounded", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-atomic-held-"));
    const path = join(root, "record.md");
    try {
        await writeFile(path, "first\n");
        let attempts = 0;
        await assert.rejects(
            () =>
                writeFileAtomic(path, "second\n", {
                    attempts: 6,
                    retryMs: 1,
                    rename: async () => {
                        attempts += 1;
                        throw refusal("EPERM");
                    }
                }),
            (error: any) => {
                // Not translated into a lock timeout or a contention error:
                // a rename that never lands is not a queue, and the caller
                // needs the errno to find out what is holding the file.
                assert.equal(error.code, "EPERM");
                assert.equal(error.syscall, "rename");
                return true;
            }
        );
        assert.equal(attempts, 6, "the retry has to be bounded by attempts");
        assert.equal(await readFile(path, "utf8"), "first\n");
        assert.deepEqual(await readdir(root), ["record.md"]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * The reason the retry cannot be the whole answer: a read-only destination is
 * refused with `EPERM` from the same call, and waiting cannot fix it. The code
 * says nothing, so the destination is asked instead — and asked once, before
 * any of the sleeping.
 */
test(
    "a destination nobody may write to fails at once, without waiting",
    { skip: process.getuid?.() === 0 ? "root writes read-only files" : false },
    async () => {
        const root = await mkdtemp(join(tmpdir(), "workfile-atomic-ro-"));
        const path = join(root, "record.md");
        try {
            await writeFile(path, "first\n");
            await chmod(path, 0o444);
            let attempts = 0;
            const started = Date.now();

            await assert.rejects(
                () =>
                    writeFileAtomic(path, "second\n", {
                        attempts: 40,
                        retryMs: 50,
                        rename: async () => {
                            attempts += 1;
                            throw refusal("EPERM");
                        }
                    }),
                (error: any) => {
                    assert.equal(error.code, "EPERM");
                    return true;
                }
            );

            assert.equal(attempts, 1, "a permanent refusal must not be retried");
            assert.ok(
                Date.now() - started < 1000,
                "and must not spend the window discovering that"
            );
        } finally {
            await chmod(path, 0o644).catch(() => undefined);
            await rm(root, { recursive: true, force: true });
        }
    }
);

test("a refusal that is not about the destination is not retried", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-atomic-other-"));
    const path = join(root, "record.md");
    try {
        let attempts = 0;
        await assert.rejects(
            () =>
                writeFileAtomic(path, "second\n", {
                    retryMs: 1,
                    rename: async () => {
                        attempts += 1;
                        throw refusal("ENOSPC");
                    }
                }),
            (error: any) => error.code === "ENOSPC"
        );
        assert.equal(attempts, 1);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * The whole scenario, with a real reader and a real rename. It proves nothing
 * on POSIX, where the rename never notices the handle; on Windows it is the
 * case this change exists for, and it fails there without the retry.
 */
test("a reader that lets go mid-write does not cost the write", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-atomic-reader-"));
    const path = join(root, "record.md");
    try {
        await writeFile(path, "first\n");
        const reader = await open(path, "r");
        assert.equal(await reader.readFile("utf8"), "first\n");
        const released = new Promise((done) =>
            setTimeout(() => done(reader.close()), 120)
        );

        await writeFileAtomic(path, "second\n");
        await released;

        assert.equal(await readFile(path, "utf8"), "second\n");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a rename refusal is told apart from a disk that is full", () => {
    for (const code of ["EPERM", "EACCES", "EBUSY"]) {
        assert.equal(isRenameRefusal(refusal(code)), true, code);
    }
    for (const code of ["ENOSPC", "ENOENT", "EROFS", "EXDEV"]) {
        assert.equal(isRenameRefusal(refusal(code)), false, code);
    }
    assert.equal(isRenameRefusal(new Error("no code")), false);
    assert.equal(isRenameRefusal(null), false);
});
