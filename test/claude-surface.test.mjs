import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    checkClaudeSurface,
    claudeCommandFiles,
    claimCard,
    createCard,
    loadWorkspace,
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

/** Drives a hook the way Claude Code does: JSON on stdin, JSON on stdout. */
function runHook(command, input, cwd) {
    return new Promise((done) => {
        const child = execFile(
            process.execPath,
            [runtime, command],
            { cwd, env: { ...process.env, CLAUDE_PROJECT_DIR: cwd } },
            (_error, stdout, stderr) => done({ stdout, stderr })
        );
        child.stdin.end(JSON.stringify(input));
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

// The plugin ships a second copy of the runtime and the commands. A copy is
// exactly how two things start telling agents different stories, so the build
// derives both from the same source and this asserts they still match — byte
// for byte for the runtime, because a hook that behaves differently depending
// on how it was installed is the worst kind of bug to chase.
test("the distributable plugin cannot drift from the generated surface", async () => {
    const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
    const pluginRoot = join(repoRoot, "plugins/workfile");

    const [source, packaged] = await Promise.all([
        readFile(join(repoRoot, "src/runtime/claude/hooks.mjs"), "utf8"),
        readFile(join(pluginRoot, "runtime/hooks.mjs"), "utf8")
    ]);
    assert.equal(
        packaged,
        source,
        "run `node scripts/build-plugin.mjs`: the packaged hook runtime is stale"
    );

    for (const command of claudeCommandFiles()) {
        assert.equal(
            await readFile(join(pluginRoot, `commands/${command.name}.md`), "utf8"),
            command.content,
            `run \`node scripts/build-plugin.mjs\`: commands/${command.name}.md is stale`
        );
    }

    // Version drift is silent and confusing: a plugin that reports an older
    // version than the package it wraps sends people to the wrong changelog.
    const pkg = JSON.parse(
        await readFile(join(repoRoot, "package.json"), "utf8")
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
