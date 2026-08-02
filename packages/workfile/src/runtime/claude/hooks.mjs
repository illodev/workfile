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
            scope: Array.isArray(fields.scope)
                ? fields.scope
                : fields.scope
                  ? [fields.scope]
                  : []
        });
    }
    return { claims, builtAt: new Date().toISOString() };
}

function scopeCovers(scope, repoPath) {
    return scope.some((entry) => {
        const normalized = entry.replace(/\/+$/, "");
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
    const board = await buildBoard(root);
    await mkdir(join(root, CACHE), { recursive: true });
    await pruneSessions(root);
    await signal(root, input);
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
                    permissionDecisionReason:
                        `${repoPath} is a protocol record. Use the project CLI or MCP tools ` +
                        "(project_card_patch, project_card_write, project_card_note) so the " +
                        "write takes a lock and checks the revision."
                }
            })}\n`
        );
        return;
    }

    const board = await readBoard(root);
    const mine = actorFor(input);
    const conflict = board.claims.find(
        (claim) =>
            claim.status === "doing" &&
            claim.claimedBy !== mine &&
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
