import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { sessionDiscriminator } from "../../core/actor.js";
import { writeFileAtomic } from "../../core/filesystem.js";
import { withFileLock } from "../../core/locks.js";
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
 * The precomputed claim board.
 *
 * `PreToolUse` fires before every tool call in a session, so it cannot read the
 * card corpus — 84 cards measured 27 ms against a hook budget of roughly 31. It
 * reads this file instead.
 *
 * Nothing wrote it but `session-start`. So the board a session consulted was
 * the one that existed when the session opened, and every claim taken
 * afterwards — by this agent or by any other agent sharing the working tree —
 * was invisible to the guard for the rest of the session. Measured in this
 * repository: `{"claims":[],"builtAt":"...T11:41:17Z"}` while nine cards were
 * claimed between 16:05 and 16:26. The scope guard has never fired here, and
 * this is why.
 *
 * A cache of claims belongs to the thing that changes claims. Written from the
 * mutation, it is correct for every surface at once — CLI, HTTP, MCP — and
 * across sessions, because another agent's `card claim` in the same tree
 * updates the same file.
 */
function boardPath(workspace) {
    return join(workspace.paths.cache, "activity", "board.json");
}

/** The board's view of one card, or null when it holds no claim. */
export function claimBoardEntry(card, sessions: any[] = []) {
    if (!card?.claimed_by) return null;
    return {
        id: card.id,
        title: card.title,
        status: card.status,
        claimedBy: card.claimed_by,
        claimedAt: card.claimed_at,
        /**
         * The session this claim belongs to, resolved here because here is where
         * the session files are in hand (T-0219).
         *
         * The board carried `claimedBy` and nothing else, so the scope guard —
         * which reads only this file — could recover a session from the actor's
         * tail and no other way. A `claimed_by` written from an explicit
         * `--actor` has no tail, so two agents sharing one saw a string equal to
         * their own and the guard stayed silent. That is the residual ADR-0020
         * left open, and LRN-0030 records it.
         *
         * `null` when there is none to find — **unknown, not absent**, which
         * is the distinction T-0229 turned on. The guard has to treat it as
         * "unproven": neither as "the same process" nor as proof of a
         * different one. `claimSeparation` decides which, and does it by
         * comparing actors.
         */
        session: sessionForClaim(card, sessions),
        scope: Array.isArray(card.scope)
            ? card.scope
            : card.scope
              ? [card.scope]
              : []
    };
}

/**
 * The session behind a claim: the one that named this card, else the one
 * belonging to this actor, else whatever the actor's tail carries.
 *
 * The first two are the same two-step `claimState` and the activity snapshot
 * take, in that order and for the reason T-0206 established — a session that
 * names the card beats one that merely shares an actor, because two agents can
 * share an actor.
 */
function sessionForClaim(card, sessions: any[]): string | null {
    const match =
        sessions.find((candidate) => candidate.cardId === card.id) ||
        sessions.find((candidate) => candidate.actor === card.claimed_by);
    return (
        sessionDiscriminator(match?.sessionId) ??
        claimSession({ by: card.claimed_by }) ??
        null
    );
}

export async function readClaimBoard(workspace) {
    try {
        return JSON.parse(await readFile(boardPath(workspace), "utf8"));
    } catch {
        return { claims: [], builtAt: null };
    }
}

async function writeBoard(workspace, claims, now) {
    claims.sort((left, right) => String(left.id).localeCompare(String(right.id)));
    await writeFileAtomic(
        boardPath(workspace),
        `${JSON.stringify({ claims, builtAt: now.toISOString() })}\n`
    );
    return { claims, builtAt: now.toISOString() };
}

/**
 * Applies one card's claim to the board.
 *
 * A delta rather than a rebuild, for two reasons. A rebuild would re-read every
 * card, which is the cost T-0081 removed from mutations. And it would be wrong
 * under concurrency: two agents claiming different cards hold different card
 * locks, so a rebuild from a listing read before the other claim would drop it.
 * Touching only this card's entry cannot lose another's.
 *
 * The board file has its own lock, always taken inside the card lock and never
 * the other way round.
 */
export async function updateClaimBoard(workspace, card, { now = new Date() } = {}) {
    return withFileLock(
        join(workspace.paths.cache, "locks", "board.lock"),
        async () => {
            const board = await readClaimBoard(workspace);
            const claims = (board.claims || []).filter(
                (claim) => claim.id !== card.id
            );
            const entry = claimBoardEntry(card, await readAgentSessions(workspace, { now }));
            if (entry) claims.push(entry);
            return writeBoard(workspace, claims, now);
        },
        { metadata: { module: "cards", recordId: "board" } }
    );
}

/** The whole board from a listing, for session start and for repair. */
export async function rebuildClaimBoard(workspace, cards, { now = new Date() } = {}) {
    // Read once for the whole sweep rather than per card.
    const sessions = await readAgentSessions(workspace, { now });
    return writeBoard(
        workspace,
        cards.map((card) => claimBoardEntry(card, sessions)).filter(Boolean),
        now
    );
}

/**
 * Whether a mutation changed anything the board carries.
 *
 * Rewriting it for a title-only patch would be harmless and wasteful; the point
 * is that a claim, a release, a status move and a scope edit all change it, and
 * all four go through `mutateCard`.
 */
export function claimBoardChanged(before, after) {
    return ["claimed_by", "claimed_at", "status", "title", "scope"].some(
        (key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])
    );
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
    // The card's own session wins over any session merely sharing its actor.
    // As one `find` over an `||` this returned whichever session came first, so
    // two cards held by one actor string could both be attributed to the same
    // session — which is exactly the evidence the conflict rule below reads.
    const session =
        sessions.find((candidate) => candidate.cardId === card.id) ||
        sessions.find((candidate) => candidate.actor === card.claimed_by);
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
 * The session a claim was made from, however it can be recovered.
 *
 * Two places carry it and neither is always present. A live session file knows
 * its own id; a `claimed_by` written by any process that resolved its own actor
 * carries the discriminator in its tail, which outlives the session file and
 * survives into git. Normalized through `sessionDiscriminator` so a full id from
 * a session file and an eight-character tail from an actor compare equal.
 */
export function claimSession(claim: {
    by?: string | null;
    sessionId?: string | null;
}): string | null {
    const fromSession = sessionDiscriminator(claim.sessionId || undefined);
    if (fromSession) return fromSession;
    const tail = /#([A-Za-z0-9]+)$/.exec(String(claim.by || ""));
    return tail ? sessionDiscriminator(tail[1]) || null : null;
}

/**
 * What tells two claims apart, or nothing if they are one process.
 *
 * The rule this replaces compared `claimed_by`, and that reads as a session only
 * by accident: `resolveActor` appends a session discriminator, so two agents
 * *usually* differ. Two plain terminals resolve to the same `user@host` and were
 * dropped as one person; so were two agents that were handed the same `--actor`.
 * Both are two processes about to overwrite each other.
 *
 * So the question is not "same actor" but "provably the same process", and the
 * answer names its own evidence, because the three cases are not equally strong:
 *
 * - `sessions-differ` — two sessions, seen, and they differ. Two processes.
 * - `actors-differ` — different actors and at most one session seen. Two people.
 * - `unproven` — the same actor and at most one session seen. One person holding
 *   two overlapping cards and two terminals racing each other are the same
 *   record; nothing in the workspace distinguishes them.
 *
 * **The actor comparison runs before the one-sided-session test, and that order
 * is the whole of the T-0229 fix.** It used to be the other way round: a
 * session on one side and none on the other returned `sessions-differ`
 * outright, on the argument that "one has a session and the other does not, so
 * they are not the same process". That argument holds when the actors differ —
 * and that case still returns `sessions-differ`, which is why the label
 * survives. It does *not* hold when the actors are the same, because then the
 * two sides did not resolve a session the same way. `session` is `null` when the board could not *find* one —
 * a `claimed_by` written from an explicit `--actor` carries no tail and matches
 * no session file — so `null` means **unknown**, not **absent**, and reading it
 * as absent turns a guess into a verdict.
 *
 * Where that cost something is the scope guard, which compares a board row
 * against a live process rather than two rows: the live side takes its session
 * off the hook payload, so it **always** has one, and the board side never did
 * for a declared actor. The one-sided branch therefore fired on every call, the
 * actor comparison was unreachable dead code, and the guard prompted agents
 * about their own cards — the exact interruption its own comment says it exists
 * to avoid. Measured on the consuming repository: **7 of 7 live claims carried
 * `session: null`**, and every in-repo edit inside a claimed scope prompted.
 *
 * The residual is the one LRN-0030 already names and it is unchanged in kind:
 * two processes handed the *same* explicit actor are indistinguishable. They are
 * `unproven` now instead of being called `sessions-differ` by accident — still
 * reported in `conflicts`, where nobody is interrupted, and no longer a verdict
 * the workspace has no evidence for.
 *
 * `unproven` is reported rather than dropped, and that is the decision T-0206
 * had to make. Silence is the bug — it is what let two terminals collide with
 * no trace. But a consumer that interrupts somebody must be able to tell a
 * verdict from a guess, which is what the label is for: the popover can show it,
 * and the scope guard does not prompt on it (see `plugins/workfile/runtime/hooks.mjs`).
 */
export function claimSeparation(
    a: { by?: string | null; sessionId?: string | null },
    b: { by?: string | null; sessionId?: string | null }
): "sessions-differ" | "actors-differ" | "unproven" | null {
    const left = claimSession(a);
    const right = claimSession(b);
    if (left && right) return left === right ? null : "sessions-differ";
    // At most one session seen, so the actors are all the evidence there is —
    // and the same actor is not enough to call it either way.
    if (a.by === b.by) return "unproven";
    // Different actors, and one side did resolve a session: two processes, seen.
    if (left || right) return "sessions-differ";
    return "actors-differ";
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
            const basis = claimSeparation(a.claim, b.claim);
            if (!basis) continue;
            const shared = a.scope.filter((path) =>
                b.scope.some(
                    (other) =>
                        path === other ||
                        path.startsWith(`${other}/`) ||
                        other.startsWith(`${path}/`)
                )
            );
            if (shared.length) {
                conflicts.push({ cards: [a.id, b.id], paths: shared, basis });
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
