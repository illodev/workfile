import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export async function writeFileAtomic(path, content) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
    try {
        await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
        await rename(temporary, path);
    } finally {
        await rm(temporary, { force: true }).catch(() => undefined);
    }
}

export async function createFileExclusive(path, content) {
    await mkdir(dirname(path), { recursive: true });
    const handle = await open(path, "wx");
    try {
        await handle.writeFile(content, "utf8");
    } finally {
        await handle.close();
    }
}

const CONTENTION_ERRORS = new Set(["EEXIST", "EPERM", "EBUSY"]);

/**
 * Whether an exclusive create was refused because somebody else got there
 * first, rather than because the path is unwritable.
 *
 * POSIX has one answer for this and it is `EEXIST`. Windows has more than one.
 * A file whose last handle is still closing sits in delete-pending state: the
 * directory entry is there, so the create is refused, but it is refused with
 * `EPERM` — and with `EBUSY` when the refusal comes from a sharing violation
 * instead. Both mean precisely what `EEXIST` means: wait, then try again.
 *
 * Every caller of this predicate was written against the POSIX code alone, so
 * the Windows codes fell through to a rethrow and reached users as
 * `INTERNAL_ERROR: EPERM: operation not permitted` — a card creation failing
 * outright where it should have queued.
 *
 * `EACCES` is deliberately Windows-only. There it is one more way of saying
 * delete-pending; on POSIX it is the ordinary "this directory is not yours to
 * write in", and retrying that until a timeout would bury the real cause under
 * a report about contention.
 *
 * The codes are a property of the filesystem, not of the kernel: a repository
 * on an SMB share hits the same refusals from Linux, which is why none of this
 * is gated on `process.platform` beyond the one code that genuinely differs.
 */
export function isCreateContention(error) {
    const code = error?.code;
    if (!code) return false;
    if (CONTENTION_ERRORS.has(code)) return true;
    return code === "EACCES" && process.platform === "win32";
}
