import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    buildActivitySnapshot,
    checkClaudeSurface,
    claimCard,
    claudeCommandFiles,
    createCard,
    loadCards,
    loadWorkspace,
    releaseCard,
    syncAgentInstructions,
    syncClaudeSurface
} from "../dist/src/index.js";

const fixture = resolve(
    fileURLToPath(new URL("./fixtures/workspace", import.meta.url))
);
const runtime = resolve(
    fileURLToPath(
        new URL("../dist/src/runtime/claude/hooks.mjs", import.meta.url)
    )
);

type HookRun = { stdout: string; stderr: string };

/** Drives a hook the way Claude Code does: JSON on stdin, JSON on stdout. */
function runHook(command, input, cwd, extraEnv = {}): Promise<HookRun> {
    return new Promise<HookRun>((done) => {
        const child = execFile(
            process.execPath,
            [runtime, command],
            {
                cwd,
                env: {
                    ...process.env,
                    CLAUDE_PROJECT_DIR: cwd,
                    ...extraEnv
                }
            },
            (_error, stdout, stderr) =>
                done({ stdout: String(stdout), stderr: String(stderr) })
        );
        child.stdin?.end(JSON.stringify(input));
    });
}

// What a repository got when it installed this package was a paragraph of text
// in CLAUDE.md that the model could ignore. Nothing was executable: the claim
// blocked nothing, no command existed, no activity was recorded.
test("the Claude Code surface is generated and verifiable", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-claude-"));
    try {
        await cp(fixture, root, { recursive: true });
        const workspace = await loadWorkspace({ root });

        const before = await checkClaudeSurface(workspace);
        assert.equal(before.ok, false);
        assert.ok(before.files.every((file) => file.status === "missing"));

        const result = await syncClaudeSurface(workspace);
        assert.ok(result.files.length >= 7);

        const after = await checkClaudeSurface(workspace);
        assert.equal(after.ok, true, JSON.stringify(after.files));

        // Commands grant exactly the subcommand they need. A generated file
        // that lands in someone's repository is a permission grant.
        const claim = await readFile(
            join(root, ".claude/commands/claim.md"),
            "utf8"
        );
        // The invocation carries the package manager's prefix. A bare
        // `workfile` only resolves when the package is installed globally, and
        // these files are executed verbatim: this fixture has no lockfile, so
        // detection falls back to npm and the widest-supported `npx` form.
        assert.match(claim, /allowed-tools: Bash\(npx workfile card claim \*\)/);
        assert.match(claim, /`npx workfile card claim \$1 --scope \$2`/);
        assert.equal(claim.includes("Bash(project *)"), false);

        // The MCP server is registered through the `mcp` SUBCOMMAND, not the
        // `workfile-mcp` bin: npx resolves the bin matching the package name
        // and passes the rest as arguments, so `npx @illodev/workfile
        // workfile-mcp` prints the help and never starts a server.
        const mcp = JSON.parse(await readFile(join(root, ".mcp.json"), "utf8"));
        assert.deepEqual(mcp.mcpServers["workfile"].args, [
            "-y",
            "@illodev/workfile",
            "mcp"
        ]);

        // Settings are merged, not replaced: the file belongs to the repository.
        await writeFile(
            join(root, ".claude/settings.json"),
            JSON.stringify(
                {
                    ...JSON.parse(
                        await readFile(join(root, ".claude/settings.json"), "utf8")
                    ),
                    model: "opus",
                    permissions: { allow: ["Bash(ls:*)"] }
                },
                null,
                2
            )
        );
        await syncClaudeSurface(workspace);
        const settings = JSON.parse(
            await readFile(join(root, ".claude/settings.json"), "utf8")
        );
        assert.equal(settings.model, "opus", "user keys survive a resync");
        assert.deepEqual(settings.permissions.allow, ["Bash(ls:*)"]);
        assert.ok(settings.hooks.PreToolUse);

        // Re-running changes nothing, which is what makes it safe to run often.
        const idempotent = await syncClaudeSurface(workspace);
        assert.ok(
            idempotent.files.every((file) =>
                ["current", "unchanged"].includes(file.status)
            ),
            JSON.stringify(idempotent.files)
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("hooks make the claim executable without slowing the session", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-hooks-"));
    try {
        await cp(fixture, root, { recursive: true });
        const workspace = await loadWorkspace({ root });
        const card = await createCard(workspace, {
            title: "Owned elsewhere",
            area: "api"
        });
        await claimCard(workspace, card.id, {
            actor: "agent-other",
            scope: ["src/api"]
        });

        // SessionStart builds the board and reports what is in flight, so the
        // agent starts informed without reading a single record.
        const start = await runHook("session-start", { session_id: "s1" }, root);
        const injected = JSON.parse(start.stdout);
        assert.equal(
            injected.hookSpecificOutput.hookEventName,
            "SessionStart"
        );
        assert.match(injected.hookSpecificOutput.additionalContext, /agent-other/);
        assert.match(injected.hookSpecificOutput.additionalContext, /src\/api/);

        // Editing inside another actor's scope asks rather than proceeding.
        const guarded = await runHook(
            "pre-tool-use",
            {
                session_id: "s1",
                tool_name: "Edit",
                tool_input: { file_path: join(root, "src/api/billing.ts") }
            },
            root
        );
        const decision = JSON.parse(guarded.stdout);
        assert.equal(
            decision.hookSpecificOutput.permissionDecision,
            "ask",
            "ask, never deny: a guard rail that blocks too much gets turned off"
        );
        assert.match(
            decision.hookSpecificOutput.permissionDecisionReason,
            /agent-other/
        );

        // Editing outside every scope is silent.
        const free = await runHook(
            "pre-tool-use",
            {
                session_id: "s1",
                tool_name: "Edit",
                tool_input: { file_path: join(root, "src/web/page.tsx") }
            },
            root
        );
        assert.equal(free.stdout.trim(), "");

        // Editing inside YOUR OWN claim is silent — the case that shipped
        // broken. The guard compared `claimed_by` against a session UUID, which
        // never matched anything, so it asked about every claim including the
        // one this session was holding. Nothing covered it: the surrounding
        // test only ever exercised *another* actor's scope.
        //
        // The actor is written here exactly as `core/actor.ts` resolves it,
        // which is what pins the hook's inline copy to the shared module: if
        // either side changes its format, this stops matching and fails.
        const ownerEnv = { USER: "solo", HOSTNAME: "box", WORKFILE_ACTOR: "" };
        const own = await createCard(workspace, { title: "Mine", area: "web" });
        await claimCard(workspace, own.id, {
            actor: "solo@box#deadbeef",
            scope: ["src/web"]
        });
        await runHook("session-start", { session_id: "deadbeef-0000" }, root, ownerEnv);
        const mineNow = await runHook(
            "pre-tool-use",
            {
                session_id: "deadbeef-0000",
                tool_name: "Edit",
                tool_input: { file_path: join(root, "src/web/page.tsx") }
            },
            root,
            ownerEnv
        );
        assert.equal(
            mineNow.stdout.trim(),
            "",
            "the guard rail must not ask about the claim this session holds"
        );

        // A different session, same machine and username, is a different actor
        // and must still be stopped. Before the fix both resolved to the same
        // string and neither could see the other.
        const neighbour = await runHook(
            "pre-tool-use",
            {
                session_id: "facefeed-1111",
                tool_name: "Edit",
                tool_input: { file_path: join(root, "src/web/page.tsx") }
            },
            root,
            ownerEnv
        );
        assert.match(
            JSON.parse(neighbour.stdout).hookSpecificOutput.permissionDecisionReason,
            /solo@box#deadbeef/
        );

        // Writing a protocol record outside the protocol skips the lock, the
        // revision check and validation, so it always asks.
        const raw = await runHook(
            "pre-tool-use",
            {
                session_id: "s1",
                tool_name: "Write",
                tool_input: {
                    file_path: join(root, ".project/cards/T-0001-something.md")
                }
            },
            root
        );
        assert.match(
            JSON.parse(raw.stdout).hookSpecificOutput.permissionDecisionReason,
            /project CLI or MCP/
        );

        // The budget is the point: PreToolUse runs before *every* tool call in
        // the session, not only the ones it might block, so the runtime imports
        // nothing from the package. Absolute caps measured that claim badly —
        // a loaded windows runner spends 700 ms spawning node, and tripped on
        // machine weather rather than on a regression. The claim is relative
        // by nature, so the floor is a stand-in process that pays the same
        // fixed costs the hook pays — spawn, reading a script file, the stdin
        // round-trip, a couple of small file reads — and the hook's median
        // must stay within a small multiple of the floor's median. Importing
        // the package's module graph in the hook shifts the whole
        // distribution on any machine, which is what this exists to catch;
        // medians ignore the single hiccup a shared runner throws in.
        const floorScript = join(root, "floor.mjs");
        await writeFile(
            floorScript,
            [
                'import { readFile } from "node:fs/promises";',
                'import { join } from "node:path";',
                "let raw = \"\";",
                'process.stdin.setEncoding("utf8");',
                'for await (const chunk of process.stdin) raw += chunk;',
                "JSON.parse(raw || \"{}\");",
                "await readFile(process.argv[1], \"utf8\");",
                'await readFile(join(process.cwd(), "package.json"), "utf8").catch(() => "");',
                ""
            ].join("\n")
        );
        const medianOf = (values) => {
            const sorted = [...values].sort((left, right) => left - right);
            return sorted[Math.floor(sorted.length / 2)];
        };
        const runFloor = () =>
            new Promise((done) => {
                const child = execFile(
                    process.execPath,
                    [floorScript],
                    { cwd: root },
                    () => done()
                );
                child.stdin.end(JSON.stringify({ warm: true }));
            });
        // One unmeasured pass each, so first-open file scanning on windows
        // runners lands outside the samples.
        await runFloor();
        const floor = [];
        const samples = [];
        for (let index = 0; index < 20; index += 1) {
            let started = Date.now();
            await runFloor();
            floor.push(Date.now() - started);
            started = Date.now();
            await runHook(
                "pre-tool-use",
                {
                    session_id: "s1",
                    tool_name: "Edit",
                    tool_input: { file_path: join(root, "src/web/page.tsx") }
                },
                root
            );
            samples.push(Date.now() - started);
        }
        const median = medianOf(samples);
        const budget = medianOf(floor) * 2 + 150;
        assert.ok(
            median < budget,
            `PreToolUse median was ${median}ms against a ${budget.toFixed(0)}ms ` +
                "budget (2× a stand-in process paying the same fixed costs, " +
                "+150ms); the hook must cost process startup, not the workspace"
        );

        // A malformed payload must never break the session it observes.
        const broken = await runHook("pre-tool-use", { nonsense: true }, root);
        assert.equal(broken.stdout.trim(), "");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// The generated files are executed verbatim by a session, so the invocation
// has to work in the repository that receives them. A bare `workfile` only
// resolves from a global install; a repository that keeps the package as a
// devDependency needs its manager's prefix, and which prefix that is comes
// from the lockfile rather than from a guess.
test("generated invocations carry the detected package manager", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-pm-"));
    try {
        await cp(fixture, root, { recursive: true });
        await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

        const workspace = await loadWorkspace({ root });
        assert.equal(workspace.packageManager, "pnpm");
        assert.equal(workspace.cli, "pnpm workfile");

        await syncClaudeSurface(workspace);
        const next = await readFile(
            join(root, ".claude/commands/next.md"),
            "utf8"
        );
        assert.match(next, /allowed-tools: Bash\(pnpm workfile card list \*\)/);
        assert.match(next, /`pnpm workfile card list --unclaimed/);

        // The skill teaches the same form, so the session is not told two
        // different things depending on which file it happens to read.
        const skill = await readFile(
            join(root, ".claude/skills/workfile/SKILL.md"),
            "utf8"
        );
        assert.match(skill, /`pnpm workfile card list --status doing`/);

        // And a repository with no lockfile still gets something that runs.
        const bare = await mkdtemp(join(tmpdir(), "workfile-pm-npm-"));
        try {
            await cp(fixture, bare, { recursive: true });
            const fallback = await loadWorkspace({ root: bare });
            assert.equal(fallback.packageManager, "npm");
            assert.equal(fallback.cli, "npx workfile");
        } finally {
            await rm(bare, { recursive: true, force: true });
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// The skill embeds the canonical protocol, and the protocol is itself a
// managed file. Carrying its markers across nested one block inside another:
// the reader stops at the inner `end`, digests a truncated body, and the file
// reported stale on every check with no edit that could settle it.
test("the skill embeds the protocol without nesting its markers", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-nest-"));
    try {
        await cp(fixture, root, { recursive: true });
        const workspace = await loadWorkspace({ root });

        // Sync the agent files first so protocol.md exists WITH its markers —
        // that is the input that used to poison the skill.
        await syncAgentInstructions(workspace);
        const protocol = await readFile(workspace.paths.agentProtocol, "utf8");
        assert.match(protocol, /workfile:begin kind=canonical-agent-protocol/);

        await syncClaudeSurface(workspace);
        const skill = await readFile(
            join(root, ".claude/skills/workfile/SKILL.md"),
            "utf8"
        );

        // Exactly one block: its own. No inner markers came along.
        assert.equal(skill.match(/workfile:begin/g).length, 1);
        assert.equal(skill.match(/workfile:end/g).length, 1);
        assert.match(skill, /kind=claude-skill/);
        assert.equal(skill.includes("canonical-agent-protocol"), false);

        // The protocol's own text still made it across.
        assert.match(skill, /Estados de Work|Work statuses/);

        // And the check settles, which is the whole point.
        const after = await checkClaudeSurface(workspace);
        assert.equal(after.ok, true, JSON.stringify(after.files));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// The plugin ships a second copy of the runtime and the commands. A copy is
// exactly how two things start telling agents different stories, so the build
// derives both from the same source and this asserts they still match — byte
// for byte for the runtime, because a hook that behaves differently depending
// on how it was installed is the worst kind of bug to chase.
test("the distributable plugin cannot drift from the generated surface", async () => {
    const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
    // The plugin and the marketplace live at the monorepo root, two levels
    // above the package that generates their contents.
    const repoRoot = resolve(packageRoot, "../..");
    const pluginRoot = join(repoRoot, "plugins/workfile");

    const [source, packaged] = await Promise.all([
        readFile(join(packageRoot, "src/runtime/claude/hooks.mjs"), "utf8"),
        readFile(join(pluginRoot, "runtime/hooks.mjs"), "utf8")
    ]);
    assert.equal(
        packaged,
        source,
        "run `node scripts/build-plugin.ts`: the packaged hook runtime is stale"
    );

    for (const command of claudeCommandFiles()) {
        assert.equal(
            await readFile(join(pluginRoot, `commands/${command.name}.md`), "utf8"),
            command.content,
            `run \`node scripts/build-plugin.ts\`: commands/${command.name}.md is stale`
        );
    }

    // Version drift is silent and confusing: a plugin that reports an older
    // version than the package it wraps sends people to the wrong changelog.
    const pkg = JSON.parse(
        await readFile(join(packageRoot, "package.json"), "utf8")
    );
    const manifest = JSON.parse(
        await readFile(join(pluginRoot, ".claude-plugin/plugin.json"), "utf8")
    );
    const marketplace = JSON.parse(
        await readFile(join(repoRoot, ".claude-plugin/marketplace.json"), "utf8")
    );
    assert.equal(manifest.version, pkg.version);
    assert.equal(marketplace.plugins[0].version, pkg.version);
    assert.equal(marketplace.plugins[0].source, "./plugins/workfile");

    // The plugin registers the MCP server against the *consuming* repository,
    // which the local generator cannot do because it has no such placeholder.
    const mcp = JSON.parse(
        await readFile(join(pluginRoot, ".mcp.json"), "utf8")
    );
    assert.ok(
        mcp.mcpServers["workfile"].args.includes(
            "${CLAUDE_PROJECT_DIR}"
        ),
        "the plugin runs from anywhere, so it must be told where the repo is"
    );

    // Hooks resolve through the plugin root, not through node_modules: a plugin
    // may be installed without the package being a dependency at all.
    const hooks = JSON.parse(
        await readFile(join(pluginRoot, "hooks/hooks.json"), "utf8")
    );
    for (const group of Object.values(hooks.hooks)) {
        for (const entry of group) {
            for (const hook of entry.hooks) {
                assert.match(hook.command, /\$\{CLAUDE_PLUGIN_ROOT\}/);
            }
        }
    }
});

/**
 * `recordAgentSignal`, `readAgentSessions` and `claimState` were all built and
 * all correct, and nothing in production called the first one — so `live` and
 * `orphaned` were unreachable, the doctor rule never fired, and the UI's live
 * count was structurally zero. The README screenshots and the landing film
 * showed a state no user could reach, staged by the capture scripts calling the
 * library directly.
 *
 * The producer is the hook, because it is the only thing that fires repeatedly
 * for as long as an agent is working.
 */
test("the hook produces the live half of a claim", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-live-"));
    try {
        await cp(fixture, root, { recursive: true });
        const workspace = await loadWorkspace({ root });
        const card = await createCard(workspace, { title: "Held live", area: "api" });
        const ownerEnv = { USER: "solo", HOSTNAME: "box", WORKFILE_ACTOR: "" };
        await claimCard(workspace, card.id, {
            actor: "solo@box#feedface",
            scope: ["src/api"]
        });

        // Nothing has signalled: the claim is held, and that is all anyone can say.
        const cold = await buildActivitySnapshot(workspace, (await loadCards(workspace)).cards);
        assert.equal(cold.sessions.length, 0);
        assert.equal(
            cold.claims.find((entry) => entry.id === card.id)?.claim.state,
            "held"
        );

        await runHook("session-start", { session_id: "feedface-0000" }, root, ownerEnv);
        await runHook(
            "post-tool-use",
            {
                session_id: "feedface-0000",
                tool_name: "Edit",
                tool_input: { file_path: join(root, "src/api/billing.ts") }
            },
            root,
            ownerEnv
        );

        const warm = await buildActivitySnapshot(workspace, (await loadCards(workspace)).cards);
        assert.equal(warm.sessions.length, 1, "the session file exists");
        assert.equal(warm.sessions[0].live, true);
        assert.equal(
            warm.sessions[0].actor,
            "solo@box#feedface",
            "the session's actor is the string the claim was written with, or nothing matches"
        );
        assert.equal(
            warm.claims.find((entry) => entry.id === card.id)?.claim.state,
            "live",
            "a claim held by a signalling session is live"
        );
        assert.ok(
            warm.sessions[0].filesTouched.some((path) => path.includes("billing")),
            "what the agent touched travels with the signal"
        );

        // A pause is not an abandonment. Between the live window and the orphan
        // window a claim stays held — otherwise every agent that spent two
        // minutes reading would put a warning on the doctor.
        const paused = await buildActivitySnapshot(
            workspace,
            (await loadCards(workspace)).cards,
            { now: new Date(Date.now() + 5 * 60_000) }
        );
        assert.equal(
            paused.claims.find((entry) => entry.id === card.id)?.claim.state,
            "held",
            "five minutes of silence is thinking, not leaving"
        );

        const gone = await buildActivitySnapshot(
            workspace,
            (await loadCards(workspace)).cards,
            { now: new Date(Date.now() + 45 * 60_000) }
        );
        assert.equal(
            gone.claims.find((entry) => entry.id === card.id)?.claim.state,
            "orphaned",
            "silence far past any pause is what orphaned means"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * The board is a cache of claims, so a claim has to write it.
 *
 * `PreToolUse` cannot read the card corpus — 84 cards measured 27 ms against a
 * hook budget of about 31 — so it reads a precomputed board. Nothing wrote that
 * board but `session-start`, which means the guard saw the claims that existed
 * when the session opened and nothing after. In this repository that was
 * `{"claims":[]}` from 11:41 while nine cards were claimed between 16:05 and
 * 16:26: the guard has never fired here, and this is why.
 *
 * Every test above seeds its claims *before* starting the session, which is the
 * one ordering that hides it. This one does it the way a session actually goes.
 */
test("a claim taken after session start is visible to the guard", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-board-"));
    const env = { USER: "solo", HOSTNAME: "box", WORKFILE_ACTOR: "" };
    try {
        await cp(fixture, root, { recursive: true });
        const workspace = await loadWorkspace({ root });

        // The session opens against a repository where nothing is claimed.
        const start = await runHook("session-start", { session_id: "s1" }, root, env);
        assert.match(
            JSON.parse(start.stdout).hookSpecificOutput.additionalContext,
            /No cards are claimed/
        );

        const later = await createCard(workspace, {
            title: "Claimed mid-session",
            area: "api"
        });
        await claimCard(workspace, later.id, {
            actor: "agent-elsewhere",
            scope: ["src/api"]
        });

        const guarded = await runHook(
            "pre-tool-use",
            {
                session_id: "s1",
                tool_name: "Edit",
                tool_input: { file_path: join(root, "src/api/billing.ts") }
            },
            root,
            env
        );
        assert.match(
            JSON.parse(guarded.stdout || "{}").hookSpecificOutput
                ?.permissionDecisionReason ?? "",
            /agent-elsewhere/,
            "a claim taken after session start must reach the guard"
        );

        // And releasing it clears the way again, without another session start.
        await releaseCard(workspace, later.id, { actor: "agent-elsewhere" });
        const free = await runHook(
            "pre-tool-use",
            {
                session_id: "s1",
                tool_name: "Edit",
                tool_input: { file_path: join(root, "src/api/billing.ts") }
            },
            root,
            env
        );
        assert.equal(free.stdout.trim(), "", "a released card guards nothing");

        // The two producers must agree on the shape, because the hook keeps its
        // own builder for hand-edited files and a fresh clone. `session-start`
        // rebuilding after a mutation wrote the board must be a no-op but for
        // the timestamp.
        await claimCard(workspace, later.id, {
            actor: "agent-elsewhere",
            scope: ["src/api"]
        });
        const boardPath = join(root, ".project/.cache/activity/board.json");
        const fromMutation = JSON.parse(await readFile(boardPath, "utf8"));
        await runHook("session-start", { session_id: "s2" }, root, env);
        const fromHook = JSON.parse(await readFile(boardPath, "utf8"));
        assert.deepEqual(
            fromHook.claims,
            fromMutation.claims,
            "the hook's builder and the core's must produce the same board"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
