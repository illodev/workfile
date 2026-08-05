import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { resolveActor, resolveSessionId } from "../dist/src/index.js";

const execute = promisify(execFile);
const cli = resolve(fileURLToPath(new URL("../dist/bin/workfile.js", import.meta.url)));
const fixture = resolve(
    fileURLToPath(new URL("./fixtures/workspace", import.meta.url))
);

/**
 * A clean environment.
 *
 * The suite itself runs inside a Claude Code session, so the real environment
 * carries a session id. Inheriting it would make these assertions depend on who
 * ran them.
 */
function env(extra: Record<string, string> = {}) {
    const base = { ...process.env } as Record<string, string | undefined>;
    for (const key of [
        "WORKFILE_ACTOR",
        "WORKFILE_SESSION_ID",
        "CLAUDE_CODE_SESSION_ID",
        "CLAUDE_SESSION_ID"
    ]) {
        delete base[key];
    }
    return { ...base, ...extra } as Record<string, string>;
}

type CliResult = { code: number; stdout: string; stderr: string };

async function runCli(args: string[], options: any = {}): Promise<CliResult> {
    try {
        const { stdout } = await execute(process.execPath, [cli, ...args], {
            encoding: "utf8",
            ...options
        });
        return { code: 0, stdout: String(stdout), stderr: "" };
    } catch (error) {
        const failed = error as { code?: number; stdout?: string; stderr?: string };
        return {
            code: failed.code ?? 1,
            stdout: String(failed.stdout ?? ""),
            stderr: String(failed.stderr ?? "")
        };
    }
}

test("actor resolution is one order, and a session makes two agents distinct", () => {
    const clean = { USER: "alvaro", HOSTNAME: "box" };

    assert.equal(
        resolveActor({ env: clean }).actor,
        "alvaro@box",
        "a plain terminal keeps a plain name"
    );

    // The whole point of the fix: two sessions in one checkout are two actors.
    // Sharing `$USER@$HOSTNAME` is what let one silently take the other's claim.
    const first = resolveActor({
        env: { ...clean, CLAUDE_CODE_SESSION_ID: "e55eab30-b661-4290-8772-d69058" }
    });
    const second = resolveActor({
        env: { ...clean, CLAUDE_CODE_SESSION_ID: "d400b09d-3b49-406b-bd58-4290ab" }
    });
    assert.notEqual(first.actor, second.actor);
    assert.equal(first.actor, "alvaro@box#e55eab30");
    assert.match(
        second.actor || "",
        /^alvaro@box#/,
        "still a name, not an opaque token"
    );

    // Precedence, top to bottom.
    assert.equal(
        resolveActor({ provided: "release-bot", env: { ...clean, WORKFILE_ACTOR: "x" } }).actor,
        "release-bot"
    );
    assert.equal(
        resolveActor({
            env: { ...clean, WORKFILE_ACTOR: "alvaro", CLAUDE_CODE_SESSION_ID: "abc123" }
        }).actor,
        "alvaro",
        "an explicit actor is not discriminated: pinning a name is the point"
    );
    assert.equal(
        resolveActor({ clientName: "claude-code", env: clean }).actor,
        "mcp:claude-code"
    );
    assert.equal(resolveActor({ env: {} }).actor, undefined);

    // `CLAUDE_SESSION_ID` was read in three places and set by nothing. It is
    // kept as a trailing fallback so a hand-rolled export keeps working.
    assert.equal(
        resolveSessionId({ env: { CLAUDE_CODE_SESSION_ID: "new", CLAUDE_SESSION_ID: "old" } }),
        "new"
    );
    assert.equal(resolveSessionId({ env: { CLAUDE_SESSION_ID: "old" } }), "old");
});

test("agents whoami reports the resolved actor and which rung produced it", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-actor-"));
    try {
        await cp(fixture, root, { recursive: true });

        const derived = await runCli(["agents", "whoami", "--json", "--root", root], {
            env: env({ USER: "alvaro", HOSTNAME: "box", CLAUDE_CODE_SESSION_ID: "abc12345-x" })
        });
        assert.equal(derived.code, 0);
        const parsed = JSON.parse(derived.stdout);
        assert.equal(parsed.actor, "alvaro@box#abc12345");
        assert.equal(parsed.source, "user@host+session");

        const pinned = await runCli(["agents", "whoami", "--json", "--root", root], {
            env: env({ USER: "alvaro", WORKFILE_ACTOR: "release-bot" })
        });
        assert.equal(JSON.parse(pinned.stdout).actor, "release-bot");
        assert.equal(JSON.parse(pinned.stdout).source, "env:WORKFILE_ACTOR");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * The hole this closes: `release` and `transition` took `option("--actor")`
 * with no default, and the ownership guard reads
 * `claimed_by && actor && claimed_by !== actor && !force`. An undefined actor
 * made the conjunction false, so omitting a flag was a silent force — along the
 * shipped plugin's own `/done` path, which transitions without an actor.
 */
test("release and transition refuse another actor's claim instead of silently taking it", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-actor-guard-"));
    try {
        await cp(fixture, root, { recursive: true });
        const mine = env({ USER: "alvaro", HOSTNAME: "box" });

        const created = await runCli(
            ["card", "create", "--title", "Held by someone else", "--area", "api", "--json", "--root", root],
            { env: mine }
        );
        const id = JSON.parse(created.stdout).id;

        await runCli(
            ["card", "claim", id, "--actor", "agent-other", "--root", root],
            { env: mine }
        );

        const transitioned = await runCli(
            ["card", "transition", id, "review", "--root", root],
            { env: mine }
        );
        assert.notEqual(transitioned.code, 0, "no actor must not mean no guard");
        assert.match(transitioned.stderr, /CARD_CLAIM_OWNER_MISMATCH/);

        const released = await runCli(["card", "release", id, "--root", root], { env: mine });
        assert.notEqual(released.code, 0);
        assert.match(released.stderr, /CARD_CLAIM/);

        // The guard has to have a documented way through, or the plugin's own
        // finalization path becomes a wall rather than a bypass. What it does
        // not have is a silent one: taking a claim over says why, the way
        // `card claim --force` has always had to.
        const unexplained = await runCli(
            ["card", "transition", id, "review", "--force", "--root", root],
            { env: mine }
        );
        assert.notEqual(unexplained.code, 0);
        assert.match(unexplained.stderr, /CARD_FORCE_REASON_REQUIRED/);

        const forced = await runCli(
            [
                "card", "transition", id, "review", "--force",
                "--reason", "agent-other stopped answering", "--json", "--root", root
            ],
            { env: mine }
        );
        assert.equal(forced.code, 0, forced.stderr);
        assert.equal(JSON.parse(forced.stdout).status, "review");
        assert.match(
            JSON.parse(forced.stdout).body,
            /· doing → review \(forced past agent-other's claim: agent-other stopped answering\)/
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
