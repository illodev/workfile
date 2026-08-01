import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { writeFileAtomic } from "../../core/filesystem.js";
import { exists } from "../../core/fs-utils.js";

/**
 * Where the *live* half of a claim lives.
 *
 * Deliberately under the cache and therefore outside git. The durable half —
 * who holds the card and since when — belongs in the card's frontmatter, where
 * it is reviewable in a diff. A heartbeat does not: refreshing a timestamp
 * every minute would leave the working tree permanently dirty and turn a
 * coordination signal into commit noise.
 */
function sessionsDirectory(workspace) {
    return join(workspace.paths.cache, "activity", "sessions");
}

function sessionPath(workspace, sessionId) {
    const safe = String(sessionId).replace(/[^\w.-]+/g, "_");
    return join(sessionsDirectory(workspace), `${safe}.json`);
}

/** Default window within which a session is considered still present. */
export const LIVE_WINDOW_MS = 90_000;

/**
 * How long a session must go quiet before its claim is called abandoned.
 *
 * Not the live window. An agent that is reading, thinking, or waiting on a
 * build signals nothing for minutes at a time and is emphatically still there;
 * calling that claim `orphaned` would put a warning on `doctor` for every
 * session that paused, and a warning that fires when nothing is wrong is how a
 * check stops being read.
 *
 * Half an hour of silence is a different claim about the world. The pid in the
 * session file cannot settle it — the hook process that wrote it exits
 * immediately, so the recorded pid is always dead by the time anyone looks.
 */
export const ORPHAN_WINDOW_MS = 1_800_000;

export async function recordAgentSignal(
    workspace,
    { sessionId, actor, cardId = null, files = [], now = new Date() }: any = {}
) {
    if (!sessionId) return null;
    const path = sessionPath(workspace, sessionId);
    let previous: any = {};
    try {
        previous = JSON.parse(await readFile(path, "utf8"));
    } catch {
        // First signal of the session, or an unreadable file: start fresh.
    }
    const session = {
        sessionId: String(sessionId),
        actor: actor || previous.actor || null,
        cardId: cardId ?? previous.cardId ?? null,
        pid: process.pid,
        startedAt: previous.startedAt || now.toISOString(),
        lastSignalAt: now.toISOString(),
        // A bounded ring: enough to show what an agent is touching, not a log.
        filesTouched: [...new Set([...(previous.filesTouched || []), ...files])].slice(
            -50
        )
    };
    await writeFileAtomic(path, `${JSON.stringify(session, null, 2)}\n`);
    return session;
}

export async function readAgentSessions(workspace, { now = new Date() } = {}) {
    const directory = sessionsDirectory(workspace);
    if (!(await exists(directory))) return [];
    let names;
    try {
        names = await readdir(directory);
    } catch {
        return [];
    }
    const sessions = [];
    for (const name of names) {
        if (!name.endsWith(".json")) continue;
        try {
            const session = JSON.parse(
                await readFile(join(directory, name), "utf8")
            );
            const age = now.getTime() - Date.parse(session.lastSignalAt);
            sessions.push({
                ...session,
                ageMs: Number.isFinite(age) ? age : null,
                live: Number.isFinite(age) && age <= LIVE_WINDOW_MS
            });
        } catch {
            // A half-written session file is not worth failing a read over.
        }
    }
    return sessions.sort((left, right) =>
        String(right.lastSignalAt || "").localeCompare(
            String(left.lastSignalAt || "")
        )
    );
}

export async function pruneAgentSessions(workspace, { olderThanMs = 86_400_000 } = {}) {
    const sessions = await readAgentSessions(workspace);
    let removed = 0;
    for (const session of sessions) {
        if ((session.ageMs ?? Infinity) > olderThanMs) {
            await rm(sessionPath(workspace, session.sessionId), {
                force: true
            }).catch(() => undefined);
            removed += 1;
        }
    }
    return { removed };
}

/**
 * What a claim actually means right now.
 *
 * `claimed_by` alone could not answer this: a claim from two minutes ago and
 * one from a process that died three days ago looked identical, so `doctor`
 * reported neither and the only way to discover an abandoned card was to try to
 * claim it and be refused.
 *
 *  - `live`      — a session is signalling within the live window.
 *  - `stale`     — held longer than the configured lease.
 *  - `orphaned`  — a session was signalling and has been silent far longer
 *                  than any pause in normal work.
 *  - `held`      — claimed, within lease, no live signal either way. Also where
 *                  a session that is merely between tool calls belongs.
 */
export function claimState(card, sessions, { leaseHours, now = new Date() }) {
    if (!card.claimed_by) return { state: "unclaimed" };
    const claimedAt = Date.parse(card.claimed_at || "");
    const ageMs = Number.isFinite(claimedAt) ? now.getTime() - claimedAt : null;
    const session = sessions.find(
        (candidate) =>
            candidate.cardId === card.id || candidate.actor === card.claimed_by
    );
    const base = {
        by: card.claimed_by,
        at: card.claimed_at || null,
        ageMs,
        ageHours: ageMs == null ? null : Math.round(ageMs / 36_000) / 100,
        sessionId: session?.sessionId ?? null
    };
    if (session?.live) return { ...base, state: "live" };
    if (ageMs != null && ageMs >= leaseHours * 3_600_000) {
        return { ...base, state: "stale" };
    }
    // Silent, but only for as long as thinking takes: still held. Before there
    // was a producer this branch could not be reached at all, so "any session
    // outside the live window is orphaned" cost nothing and read as correct.
    if (session && (session.ageMs ?? Infinity) > ORPHAN_WINDOW_MS) {
        return { ...base, state: "orphaned" };
    }
    return { ...base, state: "held" };
}

/**
 * Everything that is happening in the workspace right now.
 *
 * Three signals that already existed and that nothing combined: the lock files
 * `withFileLock` writes (which live exactly as long as a write does), the
 * durable claims in card frontmatter, and the session heartbeats. Separately
 * none of them answers "who is working on what"; together they do.
 */
export async function buildActivitySnapshot(
    workspace,
    cards,
    { now = new Date() } = {}
) {
    const sessions = await readAgentSessions(workspace, { now });
    const leaseHours = workspace.config.cards.claimLeaseHours;
    const claims = cards
        .filter((card) => card.claimed_by)
        .map((card) => ({
            id: card.id,
            title: card.title,
            status: card.status,
            area: card.area,
            scope: card.scope || [],
            claim: claimState(card, sessions, { leaseHours, now })
        }));

    // Two claims whose scopes overlap are the situation the mechanism exists to
    // prevent, and it was computed on claim and then thrown away.
    const conflicts = [];
    for (let left = 0; left < claims.length; left += 1) {
        for (let right = left + 1; right < claims.length; right += 1) {
            const a = claims[left];
            const b = claims[right];
            if (a.claim.by === b.claim.by) continue;
            const shared = a.scope.filter((path) =>
                b.scope.some(
                    (other) =>
                        path === other ||
                        path.startsWith(`${other}/`) ||
                        other.startsWith(`${path}/`)
                )
            );
            if (shared.length) {
                conflicts.push({ cards: [a.id, b.id], paths: shared });
            }
        }
    }

    const writing = await readActiveLocks(workspace);
    return {
        generatedAt: now.toISOString(),
        sessions: sessions.map((session) => ({
            sessionId: session.sessionId,
            actor: session.actor,
            cardId: session.cardId,
            live: session.live,
            ageMs: session.ageMs,
            startedAt: session.startedAt,
            filesTouched: session.filesTouched.slice(-10)
        })),
        claims,
        conflicts,
        writing
    };
}

/**
 * Records being written at this instant.
 *
 * A lock exists only while a write is in flight, so this is the most precise
 * "right now" signal in the system — and nothing read it.
 */
export async function readActiveLocks(workspace) {
    const root = join(workspace.paths.cache, "locks");
    if (!(await exists(root))) return [];
    const found = [];
    const queue = [root];
    while (queue.length) {
        const directory = queue.pop();
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                queue.push(path);
                continue;
            }
            if (!entry.name.endsWith(".lock")) continue;
            try {
                const owner = JSON.parse(await readFile(path, "utf8"));
                found.push({
                    recordId: owner.recordId ?? null,
                    module: owner.module ?? null,
                    pid: owner.pid ?? null,
                    since: owner.createdAt ?? null
                });
            } catch {
                // Half-written lock: it will be gone in a moment anyway.
            }
        }
    }
    return found;
}
