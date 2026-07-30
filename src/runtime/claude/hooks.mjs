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
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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

const sessionId = (input) => input.session_id || process.env.CLAUDE_SESSION_ID;

async function sessionStart(input) {
    const root = projectDir(input);
    const board = await buildBoard(root);
    await mkdir(join(root, CACHE), { recursive: true });
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
    const mine = sessionId(input);
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
    if (!filePath || !id) return;
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
    process.stderr.write(`project hook ${command} failed: ${error?.message}\n`);
}
process.exit(0);
