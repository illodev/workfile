import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import {
    access,
    cp,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    buildActivitySnapshot,
    checkClaudeSurface,
    claimCard,
    claimSeparation,
    claudeCommandFiles,
    claudeHooksFile,
    claudeMcpFile,
    claudeSkillFile,
    createCard,
    GLOBAL_HOOK_RUNTIME,
    hookRuntimeReachable,
    LOCAL_CLI_RUNTIME,
    listMcpTools,
    loadCards,
    loadWorkspace,
    NPM_HOOK_RUNTIME,
    PLUGIN_HOOK_RUNTIME,
    PLUGIN_PROJECT_ROOT,
    releaseCard,
    resolveActor,
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
        assert.match(
            claim,
            /allowed-tools: "Bash\(npx workfile card claim \*\)"/
        );
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
            /project_card_patch/
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
        assert.match(
            next,
            /allowed-tools: "Bash\(pnpm workfile card list \*\)"/
        );
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
test("every generated frontmatter value parses back to the string meant", () => {
    const records = [
        ...claudeCommandFiles("npx workfile").map((command) => ({
            label: `commands/${command.name}.md`,
            content: command.content
        })),
        { label: "skills/workfile/SKILL.md", content: claudeSkillFile() }
    ];

    for (const record of records) {
        // Frontmatter is only frontmatter at byte 0. Anything above the fence
        // — a blank line, a marker comment — makes the whole block body text.
        assert.equal(
            record.content.startsWith("---\n"),
            true,
            `${record.label}: the fence must open the file`
        );
        const end = record.content.indexOf("\n---\n", 3);
        assert.notEqual(end, -1, `${record.label}: unterminated frontmatter`);

        for (const line of record.content.slice(4, end).split("\n")) {
            const at = line.indexOf(": ");
            assert.notEqual(at, -1, `${record.label}: "${line}" is not a pair`);
            const key = line.slice(0, at);
            const raw = line.slice(at + 2);

            // Every value is emitted as a JSON string literal, which YAML 1.2
            // accepts verbatim as a double-quoted scalar. So parsing it as
            // JSON is parsing it as YAML, without taking a dependency for it.
            let value;
            assert.doesNotThrow(
                () => (value = JSON.parse(raw)),
                `${record.label}: ${key} is not a quoted scalar: ${raw}`
            );
            assert.equal(
                typeof value,
                "string",
                `${record.label}: ${key} parsed as ${typeof value}, not a string`
            );
        }
    }

    // The two that used to be syntax errors, and the one that parsed as a
    // one-element array while looking fine.
    const generated = new Map<string, string>(
        claudeCommandFiles("npx workfile").map((one) => [one.name, one.content])
    );
    const command = (name: string) => {
        const content = generated.get(name);
        assert.ok(content, `no generated command named ${name}`);
        return content;
    };
    assert.match(
        command("claim"),
        /^argument-hint: "\[T-0042\] \[scope,paths\]"$/m
    );
    assert.match(
        command("done"),
        /^description: "Finish a card: verify, record, release"$/m
    );
    assert.match(command("context"), /^argument-hint: "\[T-0042\]"$/m);

    // No value carries a quote today, because nothing user-supplied reaches
    // frontmatter. `cli` is the one that could, so drive the escape through it
    // rather than trusting JSON.stringify unobserved.
    const quoted = claudeCommandFiles('npx "wf"').find(
        (one) => one.name === "next"
    );
    assert.ok(quoted, "no generated command named next");
    const line = quoted.content
        .split("\n")
        .find((one) => one.startsWith("allowed-tools: "));
    assert.ok(line, "next has no allowed-tools line");
    assert.equal(
        JSON.parse(line.slice("allowed-tools: ".length)),
        'Bash(npx "wf" card list *)'
    );
});

test("an installed command opens with its frontmatter, not with a marker", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-fm-"));
    try {
        await cp(fixture, root, { recursive: true });
        const workspace = await loadWorkspace({ root });
        await syncClaudeSurface(workspace);

        const installed = [
            ".claude/commands/next.md",
            ".claude/commands/claim.md",
            ".claude/commands/done.md",
            ".claude/commands/context.md",
            ".claude/skills/workfile/SKILL.md"
        ];

        for (const relative of installed) {
            const content = await readFile(join(root, relative), "utf8");
            // Byte 0, not "contains". A fence anywhere else is body text: the
            // marker used to sit above it and every field was dropped.
            assert.equal(
                content.indexOf("---"),
                0,
                `${relative}: the fence must be the first byte`
            );
            const fenceEnd = content.indexOf("\n---\n", 3);
            assert.notEqual(fenceEnd, -1, `${relative}: unterminated frontmatter`);
            const marker = content.indexOf("# workfile kind=");
            assert.notEqual(marker, -1, `${relative}: no marker`);
            assert.equal(
                marker < fenceEnd,
                true,
                `${relative}: the marker must sit inside the frontmatter`
            );
        }

        assert.equal((await checkClaudeSurface(workspace)).ok, true);

        // The digest still covers the frontmatter, which is the whole reason
        // the marker moved inside it rather than into a preamble.
        const claim = join(root, ".claude/commands/claim.md");
        const before = await readFile(claim, "utf8");
        await writeFile(
            claim,
            before.replace(
                'description: "Claim a card before working on it"',
                'description: "Something a human typed"'
            )
        );
        const tampered = await checkClaudeSurface(workspace);
        assert.equal(tampered.ok, false, "an edited description went unnoticed");

        // And a file still in the old layout is stale rather than current,
        // even though the pair wrapped byte-identical content: without that,
        // check would bless a file whose frontmatter is inert.
        const digest = before.match(/digest=(sha256:[a-f0-9]+)/)?.[1];
        assert.ok(digest, "no digest in the marker");
        const body = before.replace(/^# workfile kind=[^\n]*\n/m, "");
        await writeFile(
            claim,
            `<!-- workfile:begin kind=claude-command-claim version=0.0.0 digest=${digest} -->\n${body.trimEnd()}\n<!-- workfile:end -->\n`
        );
        assert.equal(
            (await checkClaudeSurface(workspace)).ok,
            false,
            "the old layout reported current"
        );

        // Syncing migrates it rather than refusing it as unmanaged.
        await syncClaudeSurface(workspace);
        const migrated = await readFile(claim, "utf8");
        assert.equal(migrated.indexOf("---"), 0);
        assert.equal(migrated.includes("workfile:begin"), false);
        assert.equal((await checkClaudeSurface(workspace)).ok, true);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("the MCP server and the hooks run the same copy of the package", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-same-copy-"));
    try {
        await cp(fixture, root, { recursive: true });
        const workspace = await loadWorkspace({ root });

        // Nothing on disk to prefer, so `npx` is the registration. This is the
        // workspace that only ever used the global binary, and it still gets a
        // server that starts.
        await syncClaudeSurface(workspace);
        const remote = JSON.parse(
            await readFile(join(root, ".mcp.json"), "utf8")
        );
        assert.equal(remote.mcpServers.workfile.command, "npx");
        assert.deepEqual(remote.mcpServers.workfile.args, [
            "-y",
            "@illodev/workfile",
            "mcp"
        ]);

        // The hooks follow the same rule, which they did not until T-0178:
        // `.mcp.json` had a portable form and they had none, so in this exact
        // workspace all three named a file that is not there. The bin, not
        // `npx` — measured at 1663 ms per invocation against 26 ms, and
        // `PostToolUse` matches every tool call.
        const portable = JSON.parse(
            await readFile(join(root, ".claude", "settings.json"), "utf8")
        );
        assert.deepEqual(
            [
                portable.hooks.SessionStart[0].hooks[0].command,
                portable.hooks.PreToolUse[0].hooks[0].command,
                portable.hooks.PostToolUse[0].hooks[0].command
            ],
            [
                "workfile-hooks session-start",
                "workfile-hooks pre-tool-use",
                "workfile-hooks post-tool-use"
            ]
        );
        assert.doesNotMatch(
            JSON.stringify(portable.hooks),
            /npx/,
            "npx costs 1.6 s per hook; the measurement is in GLOBAL_HOOK_RUNTIME"
        );

        await mkdir(join(root, "node_modules", "@illodev", "workfile", "dist", "bin"), {
            recursive: true
        });
        await writeFile(
            join(root, ...LOCAL_CLI_RUNTIME.split("/")),
            "// stand-in for the installed CLI\n"
        );
        await syncClaudeSurface(workspace);

        const local = JSON.parse(
            await readFile(join(root, ".mcp.json"), "utf8")
        );
        assert.equal(local.mcpServers.workfile.command, "node");
        assert.deepEqual(local.mcpServers.workfile.args, [
            LOCAL_CLI_RUNTIME,
            "mcp"
        ]);

        // The agreement, asserted on the generated bytes rather than on the
        // constants they came from: both halves of the surface resolve inside
        // the same installed package. They disagreed for four minor versions,
        // and every symptom of that looked like something else.
        const settings = JSON.parse(
            await readFile(join(root, ".claude", "settings.json"), "utf8")
        );
        const PACKAGE = "node_modules/@illodev/workfile/";
        assert.ok(local.mcpServers.workfile.args[0].startsWith(PACKAGE));
        assert.ok(
            JSON.stringify(settings.hooks).includes(PACKAGE),
            "the hooks no longer run the local package"
        );

        // And it follows the package back out: a workspace that drops the
        // dependency gets the portable form again on the next sync.
        await rm(join(root, "node_modules"), { recursive: true, force: true });
        await syncClaudeSurface(workspace);
        assert.equal(
            JSON.parse(await readFile(join(root, ".mcp.json"), "utf8"))
                .mcpServers.workfile.command,
            "npx"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * `.mcp.json` and `.claude/settings.json` were reported `current` on the
 * strength of existing. They carry no marker to hold a digest, because they are
 * merged into files the repository also owns — but the ledger already records
 * which values are ours, and that answers the same question a digest does.
 */
test("a generated value that drifted is named, and a neighbouring one is not", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-json-drift-"));
    try {
        await cp(fixture, root, { recursive: true });
        const workspace = await loadWorkspace({ root });
        await syncClaudeSurface(workspace);

        const settingsPath = join(root, ".claude", "settings.json");
        const mcpPath = join(root, ".mcp.json");
        const read = async (path) => JSON.parse(await readFile(path, "utf8"));
        const reportFor = async (label) => {
            const report = await checkClaudeSurface(workspace);
            const entry = report.files.find((file) => file.path === label);
            assert.ok(entry, `${label} is missing from the report`);
            return entry;
        };

        assert.equal((await reportFor(".mcp.json")).status, "current");

        // What the repository put in the same objects. None of it is ours, so
        // none of it may be compared, reported or removed.
        const mine = await read(mcpPath);
        mine.mcpServers.postgres = { command: "docker", args: ["run", "pg"] };
        mine.permissions = { allow: ["Bash(ls *)"] };
        await writeFile(mcpPath, `${JSON.stringify(mine, null, 2)}\n`);
        const settings = await read(settingsPath);
        settings.hooks.Stop = [{ matcher: "*", hooks: [] }];
        await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);

        assert.equal(
            (await reportFor(".mcp.json")).status,
            "current",
            "a server the repository added is not this tool's to have an opinion about"
        );
        assert.equal((await reportFor(".claude/settings.json")).status, "current");

        // Ours, hand-edited — the case that used to read as `current` and whose
        // first symptom was an MCP server running a version nobody chose.
        const edited = await read(mcpPath);
        edited.mcpServers.workfile.args = ["-y", "@illodev/workfile@0.5.2", "mcp"];
        await writeFile(mcpPath, `${JSON.stringify(edited, null, 2)}\n`);
        const drifted = await reportFor(".mcp.json");
        assert.equal(drifted.status, "stale");
        assert.equal(
            drifted.reason,
            "mcpServers.workfile",
            "which value moved, not that something did"
        );

        // And the repair leaves the neighbours where they were.
        await syncClaudeSurface(workspace);
        const repaired = await read(mcpPath);
        assert.deepEqual(repaired.mcpServers.workfile.args, [
            "-y",
            "@illodev/workfile",
            "mcp"
        ]);
        assert.deepEqual(repaired.mcpServers.postgres, {
            command: "docker",
            args: ["run", "pg"]
        });
        assert.deepEqual(repaired.permissions, { allow: ["Bash(ls *)"] });
        assert.ok(
            (await read(settingsPath)).hooks.Stop,
            "a hook the repository owns survives our repair"
        );
        assert.equal((await reportFor(".mcp.json")).status, "current");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * The check has to answer two questions, because they have two repairs: does
 * the file say what an install would write, and can the command it names run.
 * A hook that cannot run exits 0 in silence — DOC-0005 records that this is
 * indistinguishable from one that works — so a settings file that is exactly
 * correct is not evidence of anything by itself.
 */
test("a hook that cannot run is reported apart from the file that names it", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-hook-reach-"));
    try {
        await cp(fixture, root, { recursive: true });
        const workspace = await loadWorkspace({ root });
        await syncClaudeSurface(workspace);

        // No local install and, in this process's PATH, no bin either.
        const before = process.env.PATH;
        process.env.PATH = "";
        try {
            const report = await checkClaudeSurface(workspace);
            assert.equal(report.runtime.command, GLOBAL_HOOK_RUNTIME);
            assert.equal(report.runtime.status, "unreachable");
            assert.match(report.runtime.reason, /not on PATH/);
            const issue = report.issues.find(
                (entry) => entry.code === "claude-hook-unreachable"
            );
            assert.ok(issue, "doctor has to hear about it too");
            assert.equal(
                issue.severity,
                "warning",
                "true on one machine and false on another is not an error"
            );
            // And `ok` stays about the files, which are correct. The
            // pre-commit hook runs `doctor --severity error`, so a colleague
            // without the global binary must not fail this repository's commit.
            assert.equal(report.ok, true);
            // The file itself is right. Conflating the two sends the reader to
            // re-run an install that will change nothing.
            const settings = report.files.find(
                (file) => file.path === ".claude/settings.json"
            );
            assert.ok(settings, "the settings file is missing from the report");
            assert.equal(settings.status, "current");
        } finally {
            process.env.PATH = before;
        }

        // Given the package on disk the runtime is a path, and the same
        // question is asked of the filesystem instead.
        await mkdir(join(root, "node_modules", "@illodev", "workfile", "dist", "bin"), {
            recursive: true
        });
        await writeFile(join(root, ...LOCAL_CLI_RUNTIME.split("/")), "//\n");
        await mkdir(
            join(root, "node_modules", "@illodev", "workfile", "dist", "src", "runtime", "claude"),
            { recursive: true }
        );
        const installed = await checkClaudeSurface(workspace);
        assert.match(installed.runtime.command, /node_modules/);
        assert.equal(
            installed.runtime.status,
            "unreachable",
            "the CLI is there and the hook runtime is not, which is not the same thing"
        );

        await writeFile(
            join(root, "node_modules/@illodev/workfile/dist/src/runtime/claude/hooks.mjs"),
            "//\n"
        );
        assert.equal(
            (await checkClaudeSurface(workspace)).runtime.status,
            "current"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * Why the portable form costs what the measured one costs.
 *
 * `hooks make the claim executable without slowing the session` measures
 * `dist/src/runtime/claude/hooks.mjs` against a stand-in process. That
 * measurement covers the bin as well — but only while the bin is that same
 * script. Pointing it at the CLI instead would put the package's module graph,
 * measured at 99 ms against the runtime's 25 ms, in front of every tool call,
 * and no test would have noticed.
 */
test("the portable hook runtime is the script the budget was measured on", async () => {
    const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
    const manifest = JSON.parse(
        await readFile(join(packageRoot, "package.json"), "utf8")
    );
    const bin = manifest.bin[GLOBAL_HOOK_RUNTIME];
    assert.ok(bin, `${GLOBAL_HOOK_RUNTIME} has to be a published bin to be on PATH`);
    assert.equal(
        resolve(packageRoot, bin),
        runtime,
        "the bin and the local path must be the same file, or the budget covers only one of them"
    );
    // The relative form names the same script through node_modules.
    assert.ok(NPM_HOOK_RUNTIME.endsWith(bin));
    await access(resolve(packageRoot, bin));
});

/**
 * The half of reachability that only Windows can answer.
 *
 * Its sibling above sets `PATH` to the empty string and asserts `unreachable`,
 * which every platform reaches the same way: the loop over directories does
 * nothing, so on Windows `PATHEXT` is split and then never used. The positive
 * path — a bin found on `PATH` under an extension npm chose — was covered by
 * code and by nothing else, and T-0178 shipped saying so.
 *
 * npm does not install `workfile-hooks`; it installs `workfile-hooks.cmd` (and
 * `.ps1`, and an extensionless shim for shells that want one). A lookup that
 * tests the bare name finds nothing on Windows and reports a working install
 * as broken, which is the failure this could not otherwise have caught.
 */
test("the hook runtime is found under the extension the platform installs it with", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workfile-path-"));
    const before = process.env.PATH;
    try {
        // Named the way the platform's installer names it, and nothing else in
        // the directory — so finding it means the lookup understood the name.
        const installed =
            process.platform === "win32"
                ? `${GLOBAL_HOOK_RUNTIME}.cmd`
                : GLOBAL_HOOK_RUNTIME;
        await writeFile(join(directory, installed), "", { mode: 0o755 });
        process.env.PATH = directory;

        const found = await hookRuntimeReachable(directory, GLOBAL_HOOK_RUNTIME);
        assert.equal(
            found.ok,
            true,
            `${installed} is on PATH and was not found: ${found.reason}`
        );
        assert.equal(found.reason, null);

        // And the extension is load-bearing, not decoration: the bare name on
        // Windows is exactly what npm does not write.
        if (process.platform === "win32") {
            const bare = await mkdtemp(join(tmpdir(), "workfile-path-bare-"));
            await writeFile(join(bare, GLOBAL_HOOK_RUNTIME), "");
            process.env.PATH = bare;
            const missed = await hookRuntimeReachable(bare, GLOBAL_HOOK_RUNTIME);
            assert.equal(
                missed.ok,
                false,
                "an extensionless file is not executable on Windows and must not count"
            );
            await rm(bare, { recursive: true, force: true });
        }
    } finally {
        process.env.PATH = before;
        await rm(directory, { recursive: true, force: true });
    }
});

test("a generated file that lost its last byte can be given it back", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-newline-"));
    try {
        await cp(fixture, root, { recursive: true });
        const workspace = await loadWorkspace({ root });
        await syncClaudeSurface(workspace);

        const installed = [
            ".claude/commands/next.md",
            ".claude/commands/claim.md",
            ".claude/commands/done.md",
            ".claude/commands/context.md",
            ".claude/skills/workfile/SKILL.md"
        ];
        for (const relative of installed) {
            const content = await readFile(join(root, relative), "utf8");
            assert.equal(
                content.endsWith("\n"),
                true,
                `${relative}: a text file ends with a newline`
            );
        }

        // The defect these five files were in: the byte sits outside the
        // digest, so the file merged back into itself, the write path saw no
        // change, and check called it current with nothing able to fix it.
        const claim = join(root, ".claude/commands/claim.md");
        const healthy = await readFile(claim, "utf8");
        await writeFile(claim, healthy.replace(/\n+$/, ""));

        const stripped = await checkClaudeSurface(workspace);
        const entry = stripped.files.find(
            (file) => file.path === ".claude/commands/claim.md"
        );
        assert.ok(entry, "the file was missing from the report");
        assert.equal(entry.status, "stale");
        // The reason is the point. `stale` on a file whose digest agrees is
        // what sent the field report looking at the generator, where the
        // fault was not.
        assert.equal(entry.reason, "trailing-newline");
        assert.equal(stripped.ok, false);

        await syncClaudeSurface(workspace);
        assert.equal(await readFile(claim, "utf8"), healthy);
        assert.equal((await checkClaudeSurface(workspace)).ok, true);

        // And the digest is still stable against a blank line at the end,
        // which is the whole reason it trims before hashing.
        await writeFile(claim, `${healthy}\n\n`);
        assert.equal(
            (await checkClaudeSurface(workspace)).ok,
            true,
            "a trailing blank line was read as drift"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

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

        // Its marker is a line inside the frontmatter, so the pair markers that
        // used to wrap this file are gone — and the protocol's own pair, which
        // is what used to come along for the ride, is absent with them.
        assert.equal(skill.match(/workfile:begin/g), null);
        assert.equal(skill.match(/workfile:end/g), null);
        assert.equal(skill.match(/^# workfile kind=/gm)?.length, 1);
        assert.match(skill, /kind=claude-skill/);
        assert.equal(skill.includes("canonical-agent-protocol"), false);

        // The protocol's own text still made it across. The alternation this
        // replaced only ever matched on its Spanish side — the English heading
        // is "Work states", not "Work statuses" — so it asserted nothing once
        // ADR-0012 left one copy of the protocol.
        assert.match(skill, /## Work states/);

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

    // The hook wiring was the one hand-maintained file in the plugin, and this
    // test did not look at it — so when the matchers were corrected, a user
    // installing from the marketplace kept `Edit|Write|NotebookEdit` and the
    // heartbeat stayed broken for exactly the people who did not build from
    // source. It is generated from the same function now, and compared here.
    assert.equal(
        await readFile(join(pluginRoot, "hooks/hooks.json"), "utf8"),
        `${JSON.stringify(claudeHooksFile(PLUGIN_HOOK_RUNTIME), null, 2)}\n`,
        "run `node scripts/build-plugin.ts`: the packaged hook wiring is stale"
    );

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
    //
    // This asserted only that the placeholder was somewhere in the argument
    // list, and the argument list was hand-maintained — so it went on passing
    // while the args named `workfile-mcp`, a bin npx cannot select from a
    // package spec. `npx -y @illodev/workfile workfile-mcp` runs the `workfile`
    // bin with `workfile-mcp` as its command, which prints the help to stdout
    // and exits 2: every marketplace install registered a server that answered
    // initialize with the CLI usage text. Comparing against the generator is
    // what makes the placeholder check mean something.
    assert.equal(
        await readFile(join(pluginRoot, ".mcp.json"), "utf8"),
        `${JSON.stringify(claudeMcpFile(PLUGIN_PROJECT_ROOT), null, 2)}\n`,
        "run `node scripts/build-plugin.ts`: the packaged MCP registration is stale"
    );
    const mcp = JSON.parse(
        await readFile(join(pluginRoot, ".mcp.json"), "utf8")
    );
    assert.ok(
        mcp.mcpServers["workfile"].args.includes(
            "${CLAUDE_PROJECT_DIR}"
        ),
        "the plugin runs from anywhere, so it must be told where the repo is"
    );
    // npx resolves the bin matching the package name and passes the rest along,
    // so the only invocation that reaches the server is the CLI subcommand.
    assert.equal(
        mcp.mcpServers["workfile"].args.includes("workfile-mcp"),
        false,
        "npx cannot select the workfile-mcp bin from a package spec"
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
 * The guard's reason is the only instruction an agent gets while it is stopped.
 *
 * It named `project_card_patch, project_card_write, project_card_note` for
 * every `.md` under the protocol root — cards, docs, memory, changelog and the
 * generated agent surface alike. An agent writing a doc got three tools that
 * cannot open a doc, found nothing that fit, and reached for `Edit` again; the
 * guard asked again. Nothing the user could switch off ends that loop, because
 * a hook's `ask` outranks `bypassPermissions` by design, so it presented as the
 * permission mode being broken.
 *
 * Two properties, and the second is what keeps the first honest: the message
 * must route to the tools for the record actually being written, and every
 * tool it names must exist in the MCP registry. A hardcoded table in a file
 * that imports nothing (see the runtime's header) drifts silently otherwise,
 * and pointing at a tool that was renamed is the same dead end with extra
 * steps.
 */
test("the protocol guard names the tools that write the record it stopped", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-guard-"));
    const env = { USER: "solo", HOSTNAME: "box", WORKFILE_ACTOR: "" };
    try {
        await cp(fixture, root, { recursive: true });

        const reasonFor = async (relativePath: string) => {
            const run = await runHook(
                "pre-tool-use",
                {
                    session_id: "guard",
                    tool_name: "Write",
                    tool_input: { file_path: join(root, relativePath) }
                },
                root,
                env
            );
            const decision = JSON.parse(run.stdout || "{}").hookSpecificOutput;
            assert.equal(
                decision?.permissionDecision,
                "ask",
                `${relativePath} did not reach the guard at all`
            );
            return decision.permissionDecisionReason as string;
        };

        // Nested paths on purpose: docs, memory and changelog records all live
        // one folder deeper than cards, and the type is read off the segment
        // under the protocol root rather than off the file name.
        const cases = [
            [".project/cards/T-0001-a-card.md", "card", "project_card_patch"],
            [".project/docs/reference/DOC-0001-a-doc.md", "doc", "project_doc_patch"],
            [
                ".project/memory/learnings/LRN-0001-a-learning.md",
                "memory",
                "project_memory_patch"
            ],
            [
                ".project/changelog/unreleased/CHG-0001-a-change.md",
                "changelog",
                "project_changelog_patch"
            ]
        ] as const;

        const named = new Set<string>();
        for (const [path, cli, tool] of cases) {
            const reason = await reasonFor(path);
            for (const match of reason.match(/project_[a-z_]+/g) ?? []) {
                named.add(match);
            }
            assert.match(reason, new RegExp(tool), `${path}: no tool that opens it`);
            assert.match(
                reason,
                new RegExp(`workfile ${cli} patch`),
                `${path}: the CLI form names the wrong noun`
            );
            // The regression itself: every record got card tools. A doc that
            // still mentions one has not been routed, only reworded.
            if (cli !== "card") {
                assert.equal(
                    /project_card_/.test(reason),
                    false,
                    `${path} was pointed at a card tool: ${reason}`
                );
            }
        }

        // The generated surface has no record tool at all, and a hand edit
        // there survives only until the next sync silently reverts it.
        const generated = await reasonFor(".project/agents/protocol.md");
        assert.match(generated, /agents sync/);
        assert.equal(
            /project_(card|doc|memory|changelog)_/.test(generated),
            false,
            `a generated surface was pointed at a record tool: ${generated}`
        );

        // Anything else under the root still asks, without inventing a tool for
        // it — the fallback must stay silent about names it cannot know.
        const other = await reasonFor(".project/generated/claude-code.md");
        assert.match(other, /CLI or MCP/);
        assert.equal(/project_[a-z_]+/.test(other), false);

        // Every name the guard can emit has to be a tool the server answers to.
        const registry = new Set(listMcpTools().map((tool) => tool.name));
        assert.ok(named.size >= 8, `only ${named.size} tools named across four records`);
        for (const name of named) {
            assert.ok(
                registry.has(name),
                `the guard names ${name}, which the MCP server does not expose`
            );
        }
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
        // Including the session T-0219 added. `agent-elsewhere` holds no session
        // here and `null` is the honest answer for it, so this pins the field's
        // presence; the case where a session is actually resolved is the shared
        // actor test below, which is where a non-null value can be produced.
        assert.ok(
            fromMutation.claims.every((claim: any) => "session" in claim),
            "the board entry lost its session field"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * The guard must not stop the session that took the claim.
 *
 * `core/actor.ts` and the hook's `actorFor` derive the same identity from the
 * same inputs, and neither imports the other: the hook deliberately imports
 * nothing, because a `PreToolUse` runs before every matching call and the
 * latency budget depends on it. Two copies of one derivation with nothing
 * comparing them is how they drift, and drift here is silent — the guard simply
 * starts asking about your own work until somebody switches it off.
 *
 * Behaviour, not internals: claim as the identity the CLI resolves with no
 * `--actor`, then drive the real hook for that session and require silence.
 *
 * This was live in this repository. Cards were claimed `--actor claude-opus-5`
 * because the generated protocol taught `--actor ACTOR`, so every edit inside
 * the claimed scope raised a permission prompt — over `bypassPermissions`,
 * correctly, since a hook's `ask` is the repository speaking — and `card
 * release` then refused with `CARD_CLAIM_OWNER_MISMATCH`.
 */
test("the guard is silent for the session that holds the claim", async () => {
    for (const [platform, names] of PLATFORM_ENVS) {
        await guardIsSilentFor(platform, names);
    }
});

/**
 * The username and machine name live under different variables per platform.
 *
 * `USER` and `HOSTNAME` are POSIX, and they were the only ones either
 * derivation read — so on Windows both returned nothing, `card claim` failed
 * with `CARD_CLAIM_ACTOR_REQUIRED`, and the claim protocol was unusable on the
 * platform without setting `WORKFILE_ACTOR` by hand. Running the pair against
 * both shapes is the check: the CLI and the hook have to agree on every
 * platform, not only the one the suite happens to run on.
 */
const PLATFORM_ENVS: ReadonlyArray<readonly [string, Record<string, string>]> = [
    ["posix", { USER: "solo", HOSTNAME: "box" }],
    ["windows", { USERNAME: "solo", COMPUTERNAME: "box" }]
];

/**
 * Every name blanked, so only the platform under test supplies one.
 *
 * The hook runs as a child process and inherits this one's environment, so a
 * Linux runner's own `USER` survives into the Windows case and the derivation
 * quietly reads that instead — the case passes for the wrong reason and proves
 * nothing about the platform it claims to cover.
 */
const BLANK = {
    USER: "",
    USERNAME: "",
    LOGNAME: "",
    HOSTNAME: "",
    COMPUTERNAME: "",
    WORKFILE_ACTOR: ""
};

async function guardIsSilentFor(platform: string, names: Record<string, string>) {
    const root = await mkdtemp(join(tmpdir(), "workfile-actor-"));
    const session = "e55eab30-b661-4290-bd58-d3b3a82f3b48";
    const env = { ...BLANK, ...names };
    const edit = {
        session_id: session,
        tool_name: "Edit",
        tool_input: { file_path: join(root, "src/api/billing.ts") }
    };
    try {
        await cp(fixture, root, { recursive: true });
        const workspace = await loadWorkspace({ root });
        const card = await createCard(workspace, { title: "Mine", area: "api" });

        // Exactly what `card claim` writes when no `--actor` is given.
        const mine = resolveActor({ sessionId: session, env }).actor;
        assert.equal(
            mine,
            "solo@box#e55eab30",
            `the CLI's derivation moved on ${platform}`
        );

        await claimCard(workspace, card.id, { actor: mine, scope: ["src/api"] });
        const own = await runHook("pre-tool-use", edit, root, env);
        assert.equal(
            own.stdout.trim(),
            "",
            `on ${platform} the guard asked about this session's own claim: ${own.stdout}`
        );

        // The protection itself is untouched: another actor still stops the edit.
        await releaseCard(workspace, card.id, { actor: mine });
        await claimCard(workspace, card.id, {
            actor: "agent-elsewhere",
            scope: ["src/api"]
        });
        const foreign = await runHook("pre-tool-use", edit, root, env);
        assert.match(
            JSON.parse(foreign.stdout || "{}").hookSpecificOutput
                ?.permissionDecisionReason ?? "",
            /agent-elsewhere/,
            `on ${platform} a claim held by someone else must still be guarded`
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

/**
 * A matcher that stops covering what its handler does is invisible from either
 * side alone, and this pair shipped that twice.
 *
 * T-0082 changed `postToolUse` to refresh presence on *any* tool call — its own
 * comment says restricting the heartbeat to writes would report an agent that
 * spent ten minutes investigating as gone — and left the generated matcher at
 * `Edit|Write|NotebookEdit`. Measured in this repository afterwards:
 * `lastSignalAt` forty-seven minutes behind the wall clock across a session of
 * continuous `Bash` calls, and `doctor` reporting that session's own claim as
 * abandoned while it was working. `SessionStart` had the same shape from the
 * other direction: it never reads `source`, and enumerated three of them.
 *
 * So the assertion is the pair, never the literal. Each case drives the hook
 * with an event the handler must act on, proves it acted, and then proves the
 * generated matcher would have let that event reach it.
 */
test("every matcher covers the events its handler acts on", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-matchers-"));
    const env = { USER: "solo", HOSTNAME: "box", WORKFILE_ACTOR: "" };
    try {
        await cp(fixture, root, { recursive: true });
        const workspace = await loadWorkspace({ root });
        await syncClaudeSurface(workspace);
        const settings = JSON.parse(
            await readFile(join(root, ".claude/settings.json"), "utf8")
        );

        /** How the host reads a matcher: `*` or empty is everything. */
        const covers = (matcher, value) =>
            !matcher || matcher === "*"
                ? true
                : new RegExp(`^(?:${matcher})$`).test(value);

        const sessionFile = join(
            root,
            ".project/.cache/activity/sessions/matchers.json"
        );
        const signalledAt = async () => {
            try {
                return JSON.parse(await readFile(sessionFile, "utf8")).lastSignalAt;
            } catch {
                return null;
            }
        };

        // PostToolUse must see a Bash call, because that is what an agent does
        // between writes and the handler treats it as presence.
        for (const tool of ["Bash", "Read", "Edit"]) {
            await rm(sessionFile, { force: true });
            await runHook(
                "post-tool-use",
                {
                    session_id: "matchers",
                    tool_name: tool,
                    ...(tool === "Edit"
                        ? { tool_input: { file_path: join(root, "src/api/x.ts") } }
                        : {})
                },
                root,
                env
            );
            assert.ok(
                await signalledAt(),
                `the handler ignores a ${tool} call, so presence is not "any tool call"`
            );
            assert.ok(
                covers(settings.hooks.PostToolUse[0].matcher, tool),
                `the handler acts on ${tool} and the matcher would not deliver it`
            );
        }

        // SessionStart reads no `source`, so every source must reach it —
        // including whatever a compaction produces, which is the host's
        // business and not something an enumeration here can track.
        for (const source of ["startup", "resume", "clear", "compact"]) {
            const start = await runHook(
                "session-start",
                { session_id: `s-${source}`, source },
                root,
                env
            );
            assert.match(
                JSON.parse(start.stdout).hookSpecificOutput.additionalContext,
                /claimed|No cards are claimed/,
                `the handler produces a brief for source ${source}`
            );
            assert.ok(
                covers(settings.hooks.SessionStart[0].matcher, source),
                `the handler answers ${source} and the matcher would not deliver it`
            );
        }

        // PreToolUse is the exception and stays narrow: it guards file writes,
        // it runs before every call it matches, and the budget above is built
        // on not spawning node for a Bash. So the assertion inverts — it must
        // NOT be asked about a tool it would ignore.
        const guard = settings.hooks.PreToolUse[0].matcher;
        assert.ok(!covers(guard, "Bash"), "PreToolUse must stay off the hot path");
        for (const tool of ["Edit", "Write", "NotebookEdit"]) {
            assert.ok(covers(guard, tool), `PreToolUse must guard ${tool}`);
        }
        const ignored = await runHook(
            "pre-tool-use",
            { session_id: "matchers", tool_name: "Bash", tool_input: {} },
            root,
            env
        );
        assert.equal(
            ignored.stdout.trim(),
            "",
            "a tool with no file path has nothing for the guard to say"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * T-0206: the guard and the activity snapshot must answer one question.
 *
 * The snapshot decides whether two claims are two processes; the guard decides
 * whether *this* process holds the claim covering the file. Same question, and
 * the rule is `claimSeparation`. The guard reaches it by comparing `claimed_by`
 * against its own actor, which reads as an actor comparison and is a session
 * comparison — `actorFor` writes the session into the tail. That equivalence is
 * the kind of thing that is true until somebody changes one side, so it is
 * driven rather than argued: the real hook runs for each pairing and its silence
 * has to match what `claimSeparation` says about the same two identities.
 *
 * `unproven` counts as silence. Two sessionless claims under one actor cannot be
 * told apart, and a guard that prompts a person about a card they claimed
 * themselves is the guard people switch off — the snapshot reports it instead,
 * where nobody is interrupted.
 */
const SEPARATION_CASES: ReadonlyArray<{
    label: string;
    claimedBy: string;
    session: string | null;
    actorEnv?: string;
}> = [
    {
        label: "my own session",
        claimedBy: "solo@box#e55eab30",
        session: "e55eab30-b661-4290-bd58-d3b3a82f3b48"
    },
    {
        label: "another agent's session",
        claimedBy: "solo@box#aaaaaaaa",
        session: "e55eab30-b661-4290-bd58-d3b3a82f3b48"
    },
    {
        label: "a plain terminal, seen by an agent",
        claimedBy: "solo@box",
        session: "e55eab30-b661-4290-bd58-d3b3a82f3b48"
    },
    {
        label: "another person entirely",
        claimedBy: "someone@else",
        session: "e55eab30-b661-4290-bd58-d3b3a82f3b48"
    },
    {
        label: "a configured actor claiming its own card",
        claimedBy: "ci-runner",
        session: "e55eab30-b661-4290-bd58-d3b3a82f3b48",
        actorEnv: "ci-runner"
    },
    {
        label: "a configured actor over somebody else's card",
        claimedBy: "solo@box#aaaaaaaa",
        session: "e55eab30-b661-4290-bd58-d3b3a82f3b48",
        actorEnv: "ci-runner"
    }
];

/**
 * Two agents handed the same `--actor`, which is the residual ADR-0020 left open.
 *
 * The board carried `claimedBy` and no session, so the guard could recover a
 * session only from the actor's tail — and a `claimed_by` written from an
 * explicit `--actor` has no tail. Two agents sharing one saw a string equal to
 * their own and the guard stayed silent, which is the collision it exists to
 * prevent. LRN-0030 recorded it; T-0219 is putting the session on the entry.
 *
 * Driven through the real hook rather than over `separatesFromMe`, because what
 * broke was the *board*, not the comparison: a rule reading a field nobody wrote
 * is right and useless.
 */
test("two agents sharing an explicit actor do not look like one process", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-shared-actor-"));
    const shared = "ci-runner";
    const first = "11111111-1111-4111-8111-111111111111";
    const second = "22222222-2222-4222-8222-222222222222";
    const env = { ...BLANK, USER: "solo", HOSTNAME: "box", WORKFILE_ACTOR: shared };
    const edit = (session: string) => ({
        session_id: session,
        tool_name: "Edit",
        tool_input: { file_path: join(root, "src/api/billing.ts") }
    });
    try {
        await cp(fixture, root, { recursive: true });
        const workspace = await loadWorkspace({ root });
        const card = await createCard(workspace, { title: "Contested", area: "api" });

        // Agent A opens, which is what writes its session file, and takes the
        // card with the shared actor — no tail, so the actor carries nothing.
        await runHook("session-start", { session_id: first }, root, env);
        await claimCard(workspace, card.id, { actor: shared, scope: ["src/api"] });
        assert.equal(
            (await loadCards(workspace)).cards.find((entry: any) => entry.id === card.id)
                ?.claimed_by,
            shared,
            "the claim did not record the shared actor"
        );

        // A itself must still be free to work.
        const own = await runHook("pre-tool-use", edit(first), root, env);
        assert.equal(
            own.stdout.trim(),
            "",
            `the guard asked agent A about its own card: ${own.stdout}`
        );

        // Agent B opens with its own session and the same actor. Its session start
        // rebuilds the board, which must keep A's session on the entry rather than
        // overwrite it with B's — the entry belongs to the claim, not to whoever
        // last rebuilt the file.
        await runHook("session-start", { session_id: second }, root, env);
        const board = JSON.parse(
            await readFile(join(root, ".project/.cache/activity/board.json"), "utf8")
        );
        const entry = board.claims.find((claim: any) => claim.id === card.id);
        assert.equal(
            entry?.session,
            "11111111",
            `the entry carries the wrong session: ${JSON.stringify(entry)}`
        );

        const contested = await runHook("pre-tool-use", edit(second), root, env);
        assert.match(
            JSON.parse(contested.stdout || "{}").hookSpecificOutput
                ?.permissionDecisionReason ?? "",
            new RegExp(card.id),
            "two agents sharing an actor were treated as one process"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("the scope guard and the activity snapshot apply one separation rule", async () => {
    for (const scenario of SEPARATION_CASES) {
        const root = await mkdtemp(join(tmpdir(), "workfile-separation-"));
        try {
            await cp(fixture, root, { recursive: true });
            const workspace = await loadWorkspace({ root });
            const card = await createCard(workspace, {
                title: scenario.label,
                area: "api"
            });
            await claimCard(workspace, card.id, {
                actor: scenario.claimedBy,
                scope: ["src/api"]
            });

            const env = {
                ...BLANK,
                USER: "solo",
                HOSTNAME: "box",
                ...(scenario.actorEnv ? { WORKFILE_ACTOR: scenario.actorEnv } : {})
            };
            const mine =
                scenario.actorEnv ||
                resolveActor({ sessionId: scenario.session, env }).actor;

            // The board the guard reads is written at session start, and since
            // T-0219 its entries carry the session resolved for each claim — so
            // the model below has to read it from there rather than assume null.
            // It did assume null, and the two rules then agreed by coincidence on
            // the one case where the board had learned something the model had
            // not: a pin that agrees for the wrong reason has stopped pinning.
            await runHook(
                "session-start",
                { session_id: scenario.session },
                root,
                env
            );
            const entry = JSON.parse(
                await readFile(
                    join(root, ".project/.cache/activity/board.json"),
                    "utf8"
                )
            ).claims.find((claim: any) => claim.id === card.id);
            assert.ok(entry, `${scenario.label}: the claim is not on the board`);

            // What the snapshot would say about these two identities. The guard
            // compares a claim against a live process rather than two claims, so
            // the second side is this session's identity — which always has a
            // session, whatever `WORKFILE_ACTOR` says, because it comes off the
            // hook payload rather than out of the actor string.
            const basis = claimSeparation(
                { by: scenario.claimedBy, sessionId: entry.session },
                { by: mine, sessionId: scenario.session }
            );
            const shouldPrompt = Boolean(basis) && basis !== "unproven";
            const guard = await runHook(
                "pre-tool-use",
                {
                    session_id: scenario.session,
                    tool_name: "Edit",
                    tool_input: { file_path: join(root, "src/api/billing.ts") }
                },
                root,
                env
            );
            const prompted = guard.stdout.includes("permissionDecision");
            assert.equal(
                prompted,
                shouldPrompt,
                `${scenario.label}: claimSeparation said ${basis ?? "one process"}, the guard ${
                    prompted ? "prompted" : "stayed silent"
                }`
            );
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }
});

/**
 * The shape of a `scope:` is a formatter's business, and it was the guard's.
 *
 * The hook's frontmatter parser understood a flow sequence closed on the line
 * that opened it, and nothing else. Both other shapes are what a formatter
 * leaves behind, so a pass by one turned a protected card into an unprotected
 * one — silently, which is the part that matters: a block sequence arrived as
 * an empty scope, and a re-wrapped flow sequence as a single entry `[` that
 * matches nothing while still looking like a scope.
 */
test("a scope survives every shape a formatter can leave it in", async () => {
    const shapes = {
        "block sequence": "scope:\n    - src/api\n    - src/billing\n",
        "re-wrapped flow sequence": 'scope:\n    [\n        "src/api",\n        "src/billing"\n    ]\n'
    };
    for (const [shape, written] of Object.entries(shapes)) {
        const root = await mkdtemp(join(tmpdir(), "workfile-scope-shape-"));
        try {
            await cp(fixture, root, { recursive: true });
            const workspace = await loadWorkspace({ root });
            const card = await createCard(workspace, {
                title: `Owned elsewhere, ${shape}`,
                area: "api"
            });
            await claimCard(workspace, card.id, {
                actor: "agent-other",
                scope: ["src/api", "src/billing"]
            });

            // Rewrite the one line the claim wrote into the shape under test,
            // which is exactly what a format-on-save would have done to it.
            const [file] = (await readdir(join(root, ".project/cards"))).filter(
                (name) => name.startsWith(`${card.id}-`)
            );
            const path = join(root, ".project/cards", file);
            const body = await readFile(path, "utf8");
            assert.match(body, /^scope: \[.*\]$/m, "the claim writes it on one line");
            await writeFile(path, body.replace(/^scope: \[.*\]$/m, written.trimEnd()));

            await runHook("session-start", { session_id: "s1" }, root);
            const board = JSON.parse(
                await readFile(join(root, ".project/.cache/activity/board.json"), "utf8")
            );
            const claim = board.claims.find((entry) => entry.id === card.id);
            assert.ok(claim, `${shape}: the claim reaches the board`);
            assert.deepEqual(
                claim.scope,
                ["src/api", "src/billing"],
                `${shape}: the scope arrives whole, not empty and not as a stray bracket`
            );

            // And the guard, which is the only reason the parser exists, acts
            // on it: an edit inside that scope by another session asks.
            const guarded = await runHook(
                "pre-tool-use",
                {
                    session_id: "s2",
                    tool_name: "Edit",
                    tool_input: { file_path: join(root, "src/billing/invoice.ts") }
                },
                root
            );
            assert.equal(
                JSON.parse(guarded.stdout).hookSpecificOutput?.permissionDecision,
                "ask",
                `${shape}: the guard is not blind`
            );
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }
});
