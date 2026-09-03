#!/usr/bin/env node
/**
 * Claude Code hook runtime.
 *
 * Deliberately standalone: it imports nothing from the package's own modules.
 * `src/index.js` re-exports thirteen modules and several read `package.json` at
 * load time, so importing it would put tens of milliseconds on the front of
 * every tool call in the session — and a `PreToolUse` hook runs before *all* of
 * them, not only the ones it might block.
 *
 * Everything here is one small file read and some string work. The budget is
 * a p95 under 30 ms, pinned by a test.
 */
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const CACHE = ".project/.cache/activity";
const LIVE_WINDOW_MS = 90_000;

async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    if (!chunks.length) return {};
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        return {};
    }
}

function projectDir(input) {
    return (
        process.env.CLAUDE_PROJECT_DIR ||
        input.cwd ||
        process.cwd()
    );
}

async function readJson(path, fallback) {
    try {
        return JSON.parse(await readFile(path, "utf8"));
    } catch {
        return fallback;
    }
}

/** Frontmatter only, and only the handful of keys the hooks care about. */
function frontmatterOf(text) {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return null;
    const fields = {};
    for (const line of match[1].split(/\r?\n/)) {
        const pair = line.match(/^([A-Za-z_][\w.-]*):\s*(.*)$/);
        if (!pair) continue;
        const value = pair[2].trim();
        fields[pair[1]] =
            value.startsWith("[") && value.endsWith("]")
                ? value
                      .slice(1, -1)
                      .split(",")
                      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
                      .filter(Boolean)
                : value.replace(/^["']|["']$/g, "");
    }
    return fields;
}

/**
 * The precomputed board.
 *
 * Rebuilt by `session-start` and read by the per-tool hooks, because reading
 * every card on every `Edit` is exactly the cost this must not add.
 */
async function readBoard(root) {
    return readJson(join(root, CACHE, "board.json"), { claims: [], builtAt: null });
}

async function buildBoard(root) {
    const cardsDir = join(root, ".project/cards");
    let names = [];
    try {
        names = await readdir(cardsDir);
    } catch {
        return { claims: [], builtAt: new Date().toISOString() };
    }
    // Read once for the whole sweep. This runs at session start, not on the hot
    // `PreToolUse` path, so the cost is paid where there is room for it.
    const sessions = await readSessions(root);
    const claims = [];
    for (const name of names) {
        if (!name.endsWith(".md")) continue;
        const fields = frontmatterOf(
            await readFile(join(cardsDir, name), "utf8").catch(() => "")
        );
        if (!fields?.claimed_by) continue;
        claims.push({
            id: fields.id,
            title: fields.title,
            status: fields.status,
            claimedBy: fields.claimed_by,
            claimedAt: fields.claimed_at,
            // The same two steps `claimBoardEntry` takes, over the same files: a
            // session that names this card beats one that merely shares an actor,
            // because two agents can share an actor. Falls back to the tail the
            // actor carries, and to `null` when there is none — which the guard
            // reads as unproven rather than as one process.
            session:
                discriminatorOf(
                    (
                        sessions.find((entry) => entry.cardId === fields.id) ||
                        sessions.find((entry) => entry.actor === fields.claimed_by)
                    )?.sessionId
                ) || discriminatorOf(/#([A-Za-z0-9]+)$/.exec(fields.claimed_by)?.[1]),
            scope: Array.isArray(fields.scope)
                ? fields.scope
                : fields.scope
                  ? [fields.scope]
                  : []
        });
    }
    return { claims, builtAt: new Date().toISOString() };
}

/**
 * Trailing separators removed without a regex, mirroring
 * `stripTrailingSlashes` in `core/glob.ts` — which this file cannot import, see
 * the header. `replace(/\/+$/, "")` retries the anchored `+` from every start
 * position, so N slashes cost O(N²); CodeQL flags the package's copy of that
 * spelling and is right to. The scope here comes off a card, and a card in a
 * repository taking pull requests can arrive from a fork.
 */
const withoutTrailingSlashes = (value) => {
    let end = value.length;
    while (end > 0 && value[end - 1] === "/") end -= 1;
    return end === value.length ? value : value.slice(0, end);
};

function scopeCovers(scope, repoPath) {
    return scope.some((entry) => {
        const normalized = withoutTrailingSlashes(entry);
        if (!normalized) return false;
        if (normalized.includes("*")) {
            const pattern = new RegExp(
                `^${normalized
                    .split("*")
                    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                    .join("[^/]*")}`
            );
            return pattern.test(repoPath);
        }
        return repoPath === normalized || repoPath.startsWith(`${normalized}/`);
    });
}

/**
 * The session id, used as a ledger key.
 *
 * `CLAUDE_SESSION_ID` was the only name read here and Claude Code sets
 * `CLAUDE_CODE_SESSION_ID`, so outside a hook payload this resolved to nothing.
 */
const sessionId = (input) =>
    input.session_id ||
    process.env.WORKFILE_SESSION_ID ||
    process.env.CLAUDE_CODE_SESSION_ID ||
    process.env.CLAUDE_SESSION_ID;

/**
 * Who this session is, in the same terms `claimed_by` is written in.
 *
 * A deliberate duplicate of `core/actor.ts`. This file imports nothing from the
 * package on purpose — see the header — and the two are pinned together by a
 * test that fails if they ever disagree.
 *
 * The bug this replaces: the guard below compared `claimed_by` against a
 * session UUID. They never matched, so it asked about every claim including
 * your own, which is how a guard rail teaches people to turn it off.
 */
/**
 * `sessionDiscriminator` from `core/actor.ts`, duplicated for the reason the
 * header gives: this file imports nothing from the package. Pinned against it by
 * `test/claude-surface.test.ts`, because a board written by the CLI and read by
 * this hook has to agree on what a session id normalises to.
 */
const discriminatorOf = (value) => {
    const cleaned = String(value || "").replace(/[^A-Za-z0-9]/g, "");
    return cleaned ? cleaned.slice(0, 8).toLowerCase() : null;
};

const actorFor = (input) => {
    const configured = (process.env.WORKFILE_ACTOR || "").trim();
    if (configured) return configured;
    // Same order as `core/actor.ts`, which this file cannot import (see the
    // header). `USER`/`HOSTNAME` alone are POSIX, so on Windows the hook
    // derived nothing and every claim looked like somebody else's.
    const first = (names) => {
        for (const name of names) {
            const value = (process.env[name] || "").trim();
            if (value) return value;
        }
        return "";
    };
    const user = first(["USER", "USERNAME", "LOGNAME"]);
    if (!user) return undefined;
    const host = first(["HOSTNAME", "COMPUTERNAME"]) || "local";
    const session = (sessionId(input) || "").replace(/[^A-Za-z0-9]/g, "");
    const suffix = session ? `#${session.slice(0, 8).toLowerCase()}` : "";
    return `${user}@${host}${suffix}`;
};

/**
 * Whether a claim belongs to some process other than this one.
 *
 * The rule is `claimSeparation` in `modules/cards/claims.ts`: two claims are one
 * process only when provably one session, and an actor is not a session. Here it
 * collapses back to comparing the strings, and that is worth stating rather than
 * leaving to look like a coincidence — `actorFor` writes the session
 * discriminator into the tail, so for every pairing this guard can see, actor
 * equality *is* session equality:
 *
 * - both sessions seen and equal, or the same actor with at most one session
 *   seen → one process, or `unproven` and deliberately not prompted on. A
 *   configured `WORKFILE_ACTOR` is somebody declaring an identity, and
 *   interrupting them about their own claim is how a guard rail gets switched
 *   off.
 * - both sessions seen and differing → two processes.
 * - different actors → two people.
 *
 * **The middle case used to be the first test and not the last, and that was
 * T-0229.** The order was: two sessions, then *one* session either side, then
 * actors. The second test read `null` on the board as "that claim has no
 * session", but `null` means the board could not **find** one — a `claimed_by`
 * written from an explicit `--actor` has no tail and matches no session file —
 * while `mySession` comes off `input.session_id`, which a Claude Code hook
 * **always** supplies. So the two sides never resolved the same way: the second
 * test fired on every single call, and the actor comparison below it was
 * unreachable. The guard prompted agents about their own cards, which is the
 * interruption the paragraph above says it exists to avoid. Measured on the
 * consuming repository: 7 of 7 live claims carried `session: null`, and every
 * in-repo `Edit` inside a claimed scope prompted.
 *
 * With the test removed the two branches below say the whole rule, and they are
 * `claimSeparation` verbatim — which is what makes the pinning test in
 * `test/claude-surface.test.ts` able to drive both derivations over every case
 * rather than trusting this paragraph.
 *
 * What it takes to be quiet is now what it always claimed: **declare the same
 * identity you claimed with** (`WORKFILE_ACTOR`, or an actor the tail can
 * carry). Two processes handed the *same* explicit actor stay indistinguishable
 * — that residual is LRN-0030 and it is unchanged.
 */
function separatesFromMe(claim, mine, mySession) {
    const theirs = claim.session || null;
    // Two sessions, seen. The strongest answer, and the one the board could not
    // give before T-0219 put `session` on the entry.
    if (theirs && mySession) return theirs !== mySession;
    // At most one seen, so the actors are the only evidence there is. Different
    // actors are two people; the same actor is `unproven`, and the guard stays
    // quiet on a guess rather than interrupting somebody about their own card.
    return claim.claimedBy !== mine;
}

const SESSIONS = `${CACHE}/sessions`;

/**
 * The live half of a claim.
 *
 * Mirrors `recordAgentSignal` in `modules/cards/claims.ts`, deliberately
 * duplicated: this file imports nothing from the package (see the header) and a
 * hook runs before every tool call in the session.
 *
 * The CLI is not the producer and must not become one. A one-shot process
 * writes a signal and exits, and once its file ages past the live window it
 * makes a perfectly healthy claim look abandoned — worse than no signal at all.
 * A hook is the only thing in the system that fires repeatedly for as long as
 * an agent is actually working.
 */
async function signal(root, input, files = []) {
    const id = sessionId(input);
    if (!id) return;
    const directory = join(root, SESSIONS);
    const path = join(directory, `${String(id).replace(/[^\w.-]+/g, "_")}.json`);
    const previous = await readJson(path, {});
    const now = new Date().toISOString();
    await mkdir(directory, { recursive: true });
    await writeFile(
        path,
        `${JSON.stringify(
            {
                sessionId: String(id),
                actor: actorFor(input) || previous.actor || null,
                cardId: previous.cardId ?? null,
                pid: process.pid,
                startedAt: previous.startedAt || now,
                lastSignalAt: now,
                filesTouched: [
                    ...new Set([...(previous.filesTouched || []), ...files])
                ].slice(-50)
            },
            null,
            2
        )}\n`
    );
}

/**
 * Session files outlive their sessions; something has to sweep them.
 *
 * `events.jsonl` grew to 54 KB in this repository with no reader and no
 * pruning, which is the same mistake one file down.
 */
/**
 * Every session file this workspace holds.
 *
 * Mirrors `readAgentSessions` minus the liveness arithmetic, which `buildBoard`
 * does not need: it is resolving which session a claim belongs to, not whether
 * that session is still breathing. A half-written file is skipped rather than
 * failing the sweep, the same rule the package side takes.
 */
async function readSessions(root) {
    const directory = join(root, SESSIONS);
    let names;
    try {
        names = await readdir(directory);
    } catch {
        return [];
    }
    const sessions = [];
    for (const name of names) {
        if (!name.endsWith(".json")) continue;
        const session = await readJson(join(directory, name), null);
        if (session?.sessionId) sessions.push(session);
    }
    return sessions;
}

async function pruneSessions(root, olderThanMs = 86_400_000) {
    const directory = join(root, SESSIONS);
    let names;
    try {
        names = await readdir(directory);
    } catch {
        return;
    }
    for (const name of names) {
        if (!name.endsWith(".json")) continue;
        const path = join(directory, name);
        const session = await readJson(path, null);
        const age = Date.now() - Date.parse(session?.lastSignalAt || "");
        if (!Number.isFinite(age) || age > olderThanMs) {
            await rm(path, { force: true }).catch(() => undefined);
        }
    }
}

async function sessionStart(input) {
    const root = projectDir(input);
    await mkdir(join(root, CACHE), { recursive: true });
    await pruneSessions(root);
    // This session's own signal is written *before* the board is built, and the
    // order is load-bearing now that an entry carries a session (T-0219). Built
    // first, a claim this very session already holds resolved to no session — its
    // file did not exist yet — and the guard then saw a claim with none against a
    // caller with one, called them two processes, and asked the session about its
    // own card. Which is precisely the failure the guard exists not to have.
    await signal(root, input);
    const board = await buildBoard(root);
    await writeFile(
        join(root, CACHE, "board.json"),
        `${JSON.stringify(board)}\n`
    );

    const active = board.claims.filter((claim) => claim.status === "doing");
    const lines = active.length
        ? [
              "Cards currently claimed in this repository:",
              ...active.map(
                  (claim) =>
                      `- ${claim.id} ${claim.title} — ${claim.claimedBy}${
                          claim.scope.length ? ` (scope: ${claim.scope.join(", ")})` : ""
                      }`
              ),
              "",
              "Claim before you edit: /claim <id>. Do not edit inside another",
              "actor's scope without saying so."
          ]
        : [
              "No cards are claimed right now. Use /next to see what can be",
              "started, and /claim before editing."
          ];

    // Injected once per session rather than per prompt: the context is the same
    // all session, and per-prompt injection accumulates in the window.
    process.stdout.write(
        `${JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "SessionStart",
                additionalContext: lines.join("\n")
            }
        })}\n`
    );
}

/**
 * What writes each kind of protocol record.
 *
 * The reason string this feeds is the only instruction an agent gets at the
 * moment it is stopped, and it named the three *card* tools for every record —
 * so an agent writing a doc or a memory record was handed three tools that
 * cannot open it, found nothing that fit, and reached for `Edit` again. The
 * guard asked, the agent retried, and the loop read as a broken permission
 * mode: a hook's `ask` outranks `bypassPermissions`, correctly, so there was
 * nothing the user could switch off to escape it either.
 *
 * Keyed by the first segment under the protocol root, which is the layout
 * `config/defaults.ts` ships and the same assumption `buildBoard` already
 * makes. A test pins these names against the MCP registry: naming a tool that
 * does not exist is the original failure with extra steps.
 */
const RECORD_TOOLS = {
    cards: {
        cli: "card",
        tools: ["project_card_patch", "project_card_write", "project_card_note"]
    },
    docs: {
        cli: "doc",
        tools: ["project_doc_patch", "project_doc_create", "project_doc_move"]
    },
    memory: {
        cli: "memory",
        tools: ["project_memory_patch", "project_memory_add"]
    },
    changelog: {
        cli: "changelog",
        tools: ["project_changelog_patch", "project_changelog_add"]
    }
};

function protocolRecordReason(repoPath) {
    const segment = repoPath.split("/")[1];

    // `.project/agents` is generated and digest-stamped. Pointing it at a
    // record tool would be worse than the bug being fixed: no such tool opens
    // it, and a hand edit survives only until the next sync overwrites it.
    if (segment === "agents") {
        return (
            `${repoPath} is a generated agent surface. Change what generates it ` +
            "and run `workfile agents sync` — a hand edit here is reverted by the " +
            "next sync, which also checks the digest."
        );
    }

    const record = RECORD_TOOLS[segment];
    if (!record) {
        return (
            `${repoPath} is under the protocol root. Use the project CLI or MCP ` +
            "tools rather than editing it directly, so the write takes a lock and " +
            "checks the revision."
        );
    }

    return (
        `${repoPath} is a protocol record. Use ${record.tools.join(", ")} or ` +
        `\`workfile ${record.cli} patch\` so the write takes a lock and checks ` +
        "the revision."
    );
}

async function preToolUse(input) {
    const root = projectDir(input);
    const filePath = input.tool_input?.file_path;
    if (!filePath) return;
    const repoPath = relative(root, resolve(root, filePath)).replaceAll("\\", "/");

    // Editing the protocol's own records outside the protocol skips the lock,
    // the revision check and validation.
    if (repoPath.startsWith(".project/") && repoPath.endsWith(".md")) {
        process.stdout.write(
            `${JSON.stringify({
                hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "ask",
                    permissionDecisionReason: protocolRecordReason(repoPath)
                }
            })}\n`
        );
        return;
    }

    const board = await readBoard(root);
    const mine = actorFor(input);
    // Read from the payload, not from the board: this is who *this* process is,
    // and no file is opened for it. Which is the whole reason the other side's
    // session is resolved when the board is written rather than here — a
    // `PreToolUse` fires before every matching tool call, p95 under 30 ms.
    const mySession = discriminatorOf(sessionId(input));
    const conflict = board.claims.find(
        (claim) =>
            claim.status === "doing" &&
            separatesFromMe(claim, mine, mySession) &&
            claim.scope.length &&
            scopeCovers(claim.scope, repoPath)
    );
    if (!conflict) return;

    // `ask`, never `deny`. A guard rail that blocks too much gets switched off,
    // and then it protects nothing.
    process.stdout.write(
        `${JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "ask",
                permissionDecisionReason:
                    `${conflict.id} is claimed by ${conflict.claimedBy} and its scope ` +
                    `covers ${repoPath}. Coordinate, or claim the card yourself first.`
            }
        })}\n`
    );
}

async function postToolUse(input) {
    const root = projectDir(input);
    const filePath = input.tool_input?.file_path;
    const id = sessionId(input);
    if (!id) return;
    // Presence is refreshed by any tool call. Reading and running commands is
    // working; restricting the heartbeat to writes would report an agent that
    // spent ten minutes investigating as gone.
    const touched = filePath
        ? [relative(root, resolve(root, filePath)).replaceAll("\\", "/")]
        : [];
    await signal(root, input, touched);
    if (!filePath) return;
    await mkdir(join(root, CACHE), { recursive: true });
    // Append-only and one line per event: a file per event would exhaust inodes
    // and make the directory impossible to coalesce.
    await appendFile(
        join(root, CACHE, "events.jsonl"),
        `${JSON.stringify({
            at: new Date().toISOString(),
            sessionId: id,
            tool: input.tool_name,
            path: relative(root, resolve(root, filePath)).replaceAll("\\", "/")
        })}\n`
    );
}

const COMMANDS = {
    "session-start": sessionStart,
    "pre-tool-use": preToolUse,
    "post-tool-use": postToolUse
};

const command = process.argv[2];
const handler = COMMANDS[command];
if (!handler) {
    process.stderr.write(`unknown hook command: ${command}\n`);
    process.exit(2);
}
try {
    await handler(await readStdin());
} catch (error) {
    // A hook must never break the session it is observing. Failing open is the
    // only acceptable behaviour: the worst case is a missing guard rail, and
    // the alternative is a tool call that cannot proceed.
    process.stderr.write(`workfile hook ${command} failed: ${error?.message}\n`);
}
process.exit(0);
