import { mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";

import { ConflictError } from "./errors.js";

function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Whether a process id is still alive. Signal 0 tests without delivering. */
function processIsAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (error: any) {
        // EPERM means it exists but belongs to someone else — still alive.
        return error?.code === "EPERM";
    }
}

/**
 * Reads the owner recorded inside a held lock.
 *
 * The metadata has always been written; nothing ever read it. A lock left
 * behind by a SIGKILL or an OOM therefore blocked every future write to that
 * record — from the CLI, the HTTP API and MCP alike — for as long as the file
 * existed, while `doctor` reported no problem at all. The only repair was
 * knowing that `.project/.cache` exists and deleting the file by hand.
 */
export async function readLockOwner(path) {
    try {
        const owner = JSON.parse(await readFile(path, "utf8"));
        return {
            pid: Number(owner.pid),
            createdAt: owner.createdAt,
            ageMs: owner.createdAt
                ? Date.now() - Date.parse(owner.createdAt)
                : null,
            metadata: owner
        };
    } catch {
        // Unreadable or half-written: report it as an unknown owner rather than
        // throwing, so the caller still gets a chance to decide.
        return null;
    }
}

/**
 * Whether a held lock should be broken.
 *
 * Two independent signals, because neither alone is enough: a dead pid is
 * conclusive but only on this machine, and age alone would break a legitimately
 * slow write. `staleAfterMs` defaults to an order of magnitude above the
 * acquisition timeout, so a lock has to be plainly abandoned to qualify.
 */
export async function lockIsStale(path, { staleAfterMs = 0 }: any = {}) {
    const owner = await readLockOwner(path);
    if (!owner) return { stale: false, reason: "unreadable", owner: null };
    if (owner.pid && !processIsAlive(owner.pid)) {
        return { stale: true, reason: "owner-process-gone", owner };
    }
    if (
        staleAfterMs &&
        typeof owner.ageMs === "number" &&
        owner.ageMs > staleAfterMs
    ) {
        return { stale: true, reason: "expired", owner };
    }
    return { stale: false, reason: "held", owner };
}

export async function withFileLock(
    path,
    operation,
    {
        timeoutMs = 5000,
        retryMs = 25,
        metadata = {},
        staleAfterMs = 0,
        onBrokenLock
    }: any = {}
) {
    await mkdir(dirname(path), { recursive: true });
    const deadline = Date.now() + timeoutMs;
    const expiry = staleAfterMs || timeoutMs * 10;
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    while (!handle) {
        try {
            handle = await open(path, "wx");
            await handle.writeFile(
                `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString(), ...metadata })}\n`,
                "utf8"
            );
        } catch (error) {
            if (error?.code !== "EEXIST") throw error;

            const verdict = await lockIsStale(path, { staleAfterMs: expiry });
            if (verdict.stale) {
                // Losing this race is harmless: whoever unlinks first wins, and
                // the loser simply retries against a path that is now free.
                await rm(path, { force: true }).catch(() => undefined);
                if (typeof onBrokenLock === "function") {
                    onBrokenLock({ path, ...verdict });
                }
                continue;
            }

            if (Date.now() >= deadline) {
                throw new ConflictError(
                    "WRITE_LOCK_TIMEOUT",
                    "The record is currently being modified by another process.",
                    {
                        lockPath: path,
                        owner: verdict.owner?.metadata ?? null,
                        heldForMs: verdict.owner?.ageMs ?? null
                    }
                );
            }
            await sleep(retryMs);
        }
    }
    try {
        return await operation();
    } finally {
        await handle.close().catch(() => undefined);
        await rm(path, { force: true }).catch(() => undefined);
    }
}
