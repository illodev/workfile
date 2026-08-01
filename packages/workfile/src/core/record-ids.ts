import { rm } from "node:fs/promises";
import { basename, join } from "node:path";

import { ConflictError } from "./errors.js";
import { createFileExclusive } from "./filesystem.js";
import { readMarkdownTree } from "./paths.js";

/**
 * Allocating a record id that is actually unique.
 *
 * Four modules had the same allocator copied four times, and all four had the
 * same hole: the reservation lockfile is keyed on the **id**, while the durable
 * uniqueness guard — `createFileExclusive(path)` — is keyed on the **path**,
 * and every path carries a title slug. Two processes creating records with
 * different titles were therefore never mutually exclusive. The lock was
 * released the instant the file was written, so a process that read the highest
 * sequence before that write still believed the id was free, took the
 * reservation nobody was holding any more, and wrote a second file under the
 * same id.
 *
 * Measured before the fix: 500 cards, 12 concurrent `card create` processes,
 * distinct titles — duplicate ids in 6 of 6 trials. Nothing errored. Two files
 * simply carried one id, which surfaces later as `CARD_ID_AMBIGUOUS` on the
 * next mutation, or as `duplicate-record-id` in the doctor.
 *
 * A lock that protects a different key than the durable guard is not a lock.
 * The fix is one line of principle: **re-read the directory inside the held
 * reservation**, before writing anything. The scan is also what lets a losing
 * attempt jump straight to the highest observed sequence instead of crawling
 * upward one collision at a time.
 *
 * Deliberately not solved here: two clones or worktrees allocating the same id
 * independently. Nothing local can see the other checkout — that is what
 * `card renumber --duplicates` heals after a merge.
 */
export interface ReserveRecordIdOptions {
    /**
     * Every directory that may already hold a record with this prefix. Must be
     * domain-complete — an archive that is not listed is an id that can be
     * minted twice. Read recursively, because managed docs and memory
     * collections legitimately nest in folders.
     */
    directories: string[];
    /** Id prefix without the separator: `T`, `DOC`, `CHG`, `LRN`. */
    prefix: string;
    /** Directory holding reservation lockfiles. */
    lockDirectory: string;
    /** How many sequences to try before giving up. */
    maxRetries?: number;
    /** Domain-specific failure code. */
    code?: string;
}

/** A held reservation. The id is unused on disk until `release` is called. */
export interface RecordIdReservation {
    id: string;
    /** Path of the lockfile, for callers that already report it. */
    reservation: string;
    release(): Promise<void>;
}

/**
 * Takes a reservation and verifies, while holding it, that the id is free.
 *
 * The caller owns the durable write and MUST call `release()` when it is done —
 * releasing before the record exists on disk reopens exactly the race this
 * closes. Prefer `reserveRecordId`, which cannot get that wrong; this exists
 * for the release assembly, where the durable work is a staged directory move
 * too large to nest inside a callback.
 */
export async function acquireRecordId({
    directories,
    prefix,
    lockDirectory,
    maxRetries = 64,
    code = "RECORD_ID_ALLOCATION_FAILED"
}: ReserveRecordIdOptions): Promise<RecordIdReservation> {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escaped}-(\\d+)`);

    const observe = async () => {
        let highest = 0;
        const used = new Set<number>();
        for (const directory of directories) {
            if (!directory) continue;
            for (const file of await readMarkdownTree(directory)) {
                const match = basename(file).match(pattern);
                if (!match) continue;
                const value = Number(match[1]);
                used.add(value);
                if (value > highest) highest = value;
            }
        }
        return { used, highest };
    };

    let scan = await observe();
    let sequence = scan.highest + 1;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        const id = `${prefix}-${String(sequence).padStart(4, "0")}`;
        const reservation = join(lockDirectory, `${id}.lock`);
        try {
            await createFileExclusive(
                reservation,
                `${JSON.stringify({ id, pid: process.pid, createdAt: new Date().toISOString() })}\n`
            );
        } catch (error: any) {
            if (error?.code !== "EEXIST") throw error;
            // Somebody else is mid-flight on this id.
            sequence += 1;
            continue;
        }

        // The fix. Everything above this line was already here and was not
        // enough: holding the reservation says nobody else is mid-flight on
        // this id, not that the id is unused. Only disk says that.
        scan = await observe();
        if (!scan.used.has(sequence)) {
            return {
                id,
                reservation,
                release: () =>
                    rm(reservation, { force: true }).catch(() => undefined) as Promise<void>
            };
        }

        await rm(reservation, { force: true }).catch(() => undefined);
        // Jump to the end rather than crawling one collision at a time.
        sequence = scan.highest + 1;
    }

    throw new ConflictError(
        code,
        `Unable to allocate an ID with prefix ${prefix} after ${maxRetries} retries.`
    );
}

/**
 * Runs `write` with an id nothing else can be holding.
 *
 * `write` is called while the reservation is held and must perform the durable
 * creation. Throwing `EEXIST` from it retries with a fresh id, which is how a
 * path collision — same id, same title — is absorbed rather than surfaced.
 */
export async function reserveRecordId<T>(
    options: ReserveRecordIdOptions,
    write: (id: string) => Promise<T>
): Promise<T> {
    const attempts = options.maxRetries ?? 64;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const held = await acquireRecordId(options);
        try {
            return await write(held.id);
        } catch (error: any) {
            if (error?.code !== "EEXIST") throw error;
        } finally {
            await held.release();
        }
    }
    throw new ConflictError(
        options.code || "RECORD_ID_ALLOCATION_FAILED",
        `Unable to allocate an ID with prefix ${options.prefix} after ${attempts} retries.`
    );
}
