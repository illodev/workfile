import { constants } from "node:fs";
import { access, mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const RENAME_REFUSALS = new Set(["EPERM", "EACCES", "EBUSY"]);

/**
 * Whether a rename was refused for a reason that can pass on its own.
 *
 * POSIX renames straight over an open file and never notices. Windows refuses
 * while *anything* holds the destination, and measured on the runners, one
 * `fs.open(path, "r")` from this very process is enough: every share mode
 * refuses, including `ReadWrite, Delete`. So this is not about how the reader
 * asked for the file. It is about the destination being open at all — by the
 * index builder, the watcher, the HTTP server, the UI, an editor or a virus
 * scanner, any of which reads the records the CLI writes.
 */
export function isRenameRefusal(error) {
    return Boolean(error?.code && RENAME_REFUSALS.has(error.code));
}

/**
 * Whether the refusal is one that waiting cannot fix.
 *
 * A read-only destination is refused with `EPERM` too — the same code, from
 * the same call, for a reason that will still be true in a second. The code
 * cannot tell them apart, so ask the destination instead: if it cannot be
 * written to, the rename is not queued behind anybody and there is nothing to
 * wait for. A destination that does not exist yet is not the reason either.
 */
async function destinationIsUnwritable(path) {
    try {
        await access(path, constants.W_OK);
        return false;
    } catch (error: any) {
        return error?.code !== "ENOENT";
    }
}

function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Writes a file in one step, or not at all.
 *
 * The rename is retried because on Windows it is refused while a reader holds
 * the destination, and a reader that is reading holds it for as long as the
 * read takes — milliseconds. Measured on the runners: every refusal cleared
 * within 100ms of the holder letting go. The window here is an order of
 * magnitude above that, and it is a window rather than a promise: a
 * destination somebody keeps open forever still fails, with its own errno
 * rather than with an invented one, because that is the truth about it.
 */
export async function writeFileAtomic(
    path,
    content,
    {
        attempts = 20,
        retryMs = 25,
        // The rename, overridable only so a refusal can be driven on a machine
        // that does not produce one. See `isRenameRefusal` for why POSIX never
        // will.
        rename: renameFile = rename
    }: any = {}
) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
    try {
        await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
        for (let attempt = 1; ; attempt += 1) {
            try {
                await renameFile(temporary, path);
                return;
            } catch (error: any) {
                if (attempt >= attempts || !isRenameRefusal(error)) throw error;
                if (await destinationIsUnwritable(path)) throw error;
                await sleep(retryMs);
            }
        }
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
