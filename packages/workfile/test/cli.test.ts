import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import {
    cp,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
    symlink,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const cli = resolve(fileURLToPath(new URL("../dist/bin/workfile.js", import.meta.url)));
const fixture = resolve(
    fileURLToPath(new URL("./fixtures/workspace", import.meta.url))
);

async function run(args) {
    return execute(process.execPath, [cli, ...args], {
        encoding: "utf8",
        maxBuffer: 1024 * 1024
    });
}

type CliResult = { code: number; stdout: string; stderr: string };

/**
 * Runs the CLI and returns the same shape whether it exited 0 or not.
 *
 * `execFile` rejects on a non-zero exit, so asserting on the output of a
 * command that is *supposed* to fail — every validation error, and `doctor` on
 * a repository with errors — otherwise means catching an `unknown` and reaching
 * into it. This narrows once, here, instead of at every call site.
 */
async function outcome(args: string[]): Promise<CliResult> {
    try {
        const { stdout, stderr } = await run(args);
        return { code: 0, stdout, stderr };
    } catch (error) {
        const failed = error as { code?: number; stdout?: string; stderr?: string };
        return {
            code: failed.code ?? 1,
            stdout: failed.stdout ?? "",
            stderr: failed.stderr ?? ""
        };
    }
}

test("CLI exposes machine-readable schema and cards", async () => {
    const schemaResult = await run(["schema", "--root", fixture, "--json"]);
    const schema = JSON.parse(schemaResult.stdout);
    assert.equal(schema.schemaVersion, 2);
    assert.deepEqual(schema.cards.areas, ["api", "web", "infra", "docs"]);
    assert.equal(schema.docs.layout, "kind");
    assert.equal(schema.docs.managedPath, ".project/docs");

    const listResult = await run([
        "card",
        "list",
        "--root",
        fixture,
        "--json"
    ]);
    const list = JSON.parse(listResult.stdout);
    assert.equal(list.total, 2);
    assert.deepEqual(
        list.records.map((card) => card.id).sort(),
        ["T-0001", "T-0002"]
    );
});

test("CLI failures use stable codes and exit statuses", async () => {
    await assert.rejects(
        run(["card", "show", "T-9999", "--root", fixture, "--json"]),
        (error) => {
            assert.equal(error.code, 1);
            const payload = JSON.parse(error.stderr);
            assert.equal(payload.error.code, "CARD_NOT_FOUND");
            assert.match(payload.error.message, /T-9999/);
            return true;
        }
    );

    await assert.rejects(
        run(["card", "unknown", "--root", fixture, "--json"]),
        (error) => {
            assert.equal(error.code, 1);
            const payload = JSON.parse(error.stderr);
            assert.equal(payload.error.code, "CLI_COMMAND_UNKNOWN");
            return true;
        }
    );
});


test("CLI lists, creates and searches managed documentation", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-cli-docs-"));
    await cp(fixture, root, { recursive: true });
    try {
        const listResult = await run(["doc", "list", "--root", root, "--json"]);
        const list = JSON.parse(listResult.stdout);
        assert.ok(
            list.records.some((record) => record.path === "docs/architecture.md")
        );

        const createResult = await run([
            "doc",
            "create",
            "--root",
            root,
            "--title",
            "Operations runbook",
            "--kind",
            "runbook",
            "--status",
            "current",
            "--json"
        ]);
        const created = JSON.parse(createResult.stdout);
        assert.equal(created.id, "DOC-0001");
        assert.equal(created.documentKind, "runbook");
        assert.equal(created.path, ".project/docs/runbook/DOC-0001-operations-runbook.md");
        assert.equal(created.file, "runbook/DOC-0001-operations-runbook.md");

        const foldered = JSON.parse(
            (
                await run([
                    "doc",
                    "create",
                    "--root",
                    root,
                    "--title",
                    "Rate limiting",
                    "--kind",
                    "architecture",
                    "--folder",
                    "adr/2026",
                    "--json"
                ])
            ).stdout
        );
        assert.equal(
            foldered.path,
            ".project/docs/adr/2026/DOC-0002-rate-limiting.md"
        );

        await assert.rejects(
            run([
                "doc",
                "create",
                "--root",
                root,
                "--title",
                "Escaping",
                "--folder",
                "../escape",
                "--json"
            ]),
            (error) => {
                assert.equal(JSON.parse(error.stderr).error.code, "DOC_FOLDER_INVALID");
                return true;
            }
        );

        const moved = JSON.parse(
            (
                await run([
                    "doc",
                    "move",
                    "DOC-0001",
                    "--root",
                    root,
                    "--folder",
                    "",
                    "--json"
                ])
            ).stdout
        );
        assert.equal(moved.id, "DOC-0001");
        assert.equal(moved.path, ".project/docs/DOC-0001-operations-runbook.md");

        await assert.rejects(
            run(["doc", "move", "DOC-0001", "--root", root, "--json"]),
            (error) => {
                assert.equal(
                    JSON.parse(error.stderr).error.code,
                    "CLI_ARGUMENT_REQUIRED"
                );
                return true;
            }
        );

        const changes = join(root, "doc-changes.json");
        await writeFile(changes, JSON.stringify({ tags: ["operations"] }));
        const patchResult = await run([
            "doc",
            "patch",
            "DOC-0001",
            "--root",
            root,
            "--json-input",
            changes,
            "--json"
        ]);
        assert.deepEqual(JSON.parse(patchResult.stdout).tags, ["operations"]);

        const searchResult = await run([
            "search",
            "Operations runbook",
            "--kind",
            "doc",
            "--root",
            root,
            "--json"
        ]);
        const search = JSON.parse(searchResult.stdout);
        assert.equal(search.records[0].id, "DOC-0001");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("CLI manages changelog releases and typed workfile memory", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-cli-history-"));
    await cp(fixture, root, { recursive: true });
    try {
        const changeResult = await run([
            "changelog",
            "add",
            "--root",
            root,
            "--title",
            "Expose portable history",
            "--type",
            "added",
            "--area",
            "infra",
            "--cards",
            "T-0001",
            "--json"
        ]);
        const change = JSON.parse(changeResult.stdout);
        assert.equal(change.id, "CHG-0001");
        assert.equal(change.released, false);

        const previewResult = await run([
            "changelog",
            "preview",
            "--root",
            root,
            "--json"
        ]);
        const preview = JSON.parse(previewResult.stdout);
        assert.deepEqual(preview.fragments.map((item) => item.id), ["CHG-0001"]);
        assert.match(preview.markdown, /Expose portable history/);

        const releaseResult = await run([
            "changelog",
            "release",
            "0.4.0",
            "--root",
            root,
            "--title",
            "History and memory",
            "--json"
        ]);
        const release = JSON.parse(releaseResult.stdout);
        assert.equal(release.id, "REL-0001");
        assert.equal(release.version, "0.4.0");

        const renderedResult = await run([
            "changelog",
            "render",
            "--root",
            root
        ]);
        assert.match(renderedResult.stdout, /0\.4\.0/);
        assert.match(renderedResult.stdout, /Expose portable history/);

        const conventionResult = await run([
            "memory",
            "add",
            "convention",
            "--root",
            root,
            "--title",
            "Write release fragments with every user-visible change",
            "--status",
            "active",
            "--json"
        ]);
        const convention = JSON.parse(conventionResult.stdout);
        assert.equal(convention.id, "CONV-0001");

        const learningResult = await run([
            "memory",
            "add",
            "learning",
            "--root",
            root,
            "--title",
            "Atomic fragments prevent changelog merge conflicts",
            "--status",
            "active",
            "--confidence",
            "high",
            "--json"
        ]);
        const learning = JSON.parse(learningResult.stdout);
        assert.equal(learning.id, "LRN-0001");

        const graduateResult = await run([
            "memory",
            "graduate",
            learning.id,
            "--root",
            root,
            "--to",
            convention.id,
            "--json"
        ]);
        const graduated = JSON.parse(graduateResult.stdout);
        assert.equal(graduated.status, "graduated");
        assert.deepEqual(graduated.graduated_to, [convention.id]);

        const memoryList = JSON.parse(
            (
                await run([
                    "memory",
                    "list",
                    "--root",
                    root,
                    "--collection",
                    "learnings",
                    "--status",
                    "graduated",
                    "--json"
                ])
            ).stdout
        );
        assert.deepEqual(memoryList.records.map((item) => item.id), [learning.id]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("CLI synchronizes agent instructions and builds focused context", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-cli-agents-"));
    await cp(fixture, root, { recursive: true });
    try {
        const sync = JSON.parse(
            (
                await run([
                    "agents",
                    "sync",
                    "--root",
                    root,
                    "--targets",
                    "agents-md,cursor",
                    "--json"
                ])
            ).stdout
        );
        assert.deepEqual(sync.targets, ["agents-md", "cursor"]);
        assert.equal(sync.changed, 7);

        const check = JSON.parse(
            (
                await run([
                    "agents",
                    "check",
                    "--root",
                    root,
                    "--targets",
                    "agents-md,cursor",
                    "--json"
                ])
            ).stdout
        );
        assert.equal(check.ok, true);

        const context = JSON.parse(
            (
                await run([
                    "agents",
                    "context",
                    "--card",
                    "T-0001",
                    "--root",
                    root,
                    "--json"
                ])
            ).stdout
        );
        assert.equal(context.focus, "T-0001");
        assert.equal(context.records[0].id, "T-0001");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("CLI initializer and legacy migration support non-interactive automation", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-cli-init-"));
    try {
        await writeFile(
            join(root, "package.json"),
            `${JSON.stringify({ name: "cli-init" }, null, 2)}\n`
        );
        const init = JSON.parse(
            (
                await run([
                    "init",
                    "--root",
                    root,
                    "--yes",
                    "--language",
                    "es",
                    "--agents",
                    "agents-md",
                    "--json"
                ])
            ).stdout
        );
        assert.equal(init.applied.dryRun, false);

        await writeFile(
            join(root, ".planning-card.tmp"),
            "placeholder"
        );
        const planning = join(root, ".planning", "backlog", "tasks");
        const { mkdir } = await import("node:fs/promises");
        await mkdir(planning, { recursive: true });
        await writeFile(
            join(planning, "T-0042-cli.md"),
            `---\nid: T-0042\ntitle: CLI migrated card\nstatus: backlog\ntype: task\npriority: medium\narea: general\ncreated: 2026-07-28\nupdated: 2026-07-28\n---\n\nMigrated.\n`
        );
        const migrated = JSON.parse(
            (
                await run([
                    "migrate",
                    "apply",
                    "--root",
                    root,
                    "--json"
                ])
            ).stdout
        );
        assert.equal(migrated.counts.cards, 1);
        const card = JSON.parse(
            (
                await run([
                    "card",
                    "show",
                    "T-0042",
                    "--root",
                    root,
                    "--json"
                ])
            ).stdout
        );
        assert.equal(card.title, "CLI migrated card");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// Asking for help must never do work. `workfile doctor --help` used to run the
// full doctor, and `workfile card --help` failed with CLI_ARGUMENT_REQUIRED,
// because every dispatcher read argv[3] without checking whether it was a flag.
test("--help prints the subcommand help instead of running it", async () => {
    for (const command of [
        "card",
        "doc",
        "changelog",
        "memory",
        "agents",
        "ci",
        "migrate",
        "mcp",
        "doctor",
        "search"
    ]) {
        const result = await run([command, "--help", "--root", fixture]);
        assert.match(
            result.stdout,
            new RegExp(`^Workfile — ${command === "doc" ? "doc" : command}`),
            `${command} --help should print its own usage`
        );
        assert.match(result.stdout, /Global options:/);
    }

    // Aliases resolve to the section they alias.
    const docs = await run(["docs", "--help", "--root", fixture]);
    assert.match(docs.stdout, /^Workfile — doc/);
    const history = await run(["history", "--help", "--root", fixture]);
    assert.match(history.stdout, /^Workfile — changelog/);

    // `project help card` is the same thing said the other way round.
    const viaHelp = await run(["help", "card"]);
    assert.match(viaHelp.stdout, /^Workfile — card/);

    // The verify subcommands exist and are now discoverable.
    const changelog = await run(["changelog", "--help", "--root", fixture]);
    assert.match(changelog.stdout, /workfile changelog verify/);
    const memory = await run(["memory", "--help", "--root", fixture]);
    assert.match(memory.stdout, /workfile memory verify/);
});

// A flag in the subcommand position is a flag, not an action.
test("flags are not mistaken for subcommands", async () => {
    const result = await run(["mcp", "config", "--read-only", "--json", "--root", fixture]);
    const configuration = JSON.parse(result.stdout);
    assert.match(configuration.args[0], /workfile-mcp\.js$/);
    assert.ok(configuration.args.includes("--read-only"));
    assert.ok(configuration.args.includes("--root"));
});

// `card list` accepted every flag and applied none of them, then serialized the
// full Markdown body of every card. Both halves matter: a filter that silently
// does nothing is worse than an error, and a list that carries every body is
// the token bill this protocol exists to avoid.
test("card list filters, paginates and leaves bodies out of JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-cardlist-"));
    await cp(fixture, root, { recursive: true });
    const at = (args) => run([...args, "--root", root]);

    try {
        await at([
            "card",
            "create",
            "--title",
            "Filtered bug",
            "--area",
            "api",
            "--type",
            "bug",
            "--priority",
            "critical"
        ]);

        const all = JSON.parse((await at(["card", "list", "--json"])).stdout);
        assert.ok(all.total >= 2);

        const bugs = JSON.parse(
            (await at(["card", "list", "--type", "bug", "--json"])).stdout
        );
        assert.ok(bugs.total >= 1);
        assert.ok(bugs.records.every((card) => card.type === "bug"));
        assert.ok(bugs.total < all.total, "the filter must actually narrow");

        const critical = JSON.parse(
            (await at(["card", "list", "--priority", "critical", "--json"])).stdout
        );
        assert.ok(critical.records.every((card) => card.priority === "critical"));

        // Several values for one flag, and several flags together.
        const combined = JSON.parse(
            (
                await at([
                    "card",
                    "list",
                    "--type",
                    "bug,task",
                    "--area",
                    "api",
                    "--json"
                ])
            ).stdout
        );
        assert.ok(
            combined.records.every(
                (card) => ["bug", "task"].includes(card.type) && card.area === "api"
            )
        );

        // An impossible filter returns nothing rather than everything.
        const none = JSON.parse(
            (await at(["card", "list", "--status", "discarded", "--json"])).stdout
        );
        assert.equal(none.total, 0);
        assert.deepEqual(none.records, []);

        // Bodies are omitted by default and available on request.
        assert.ok(all.records.every((card) => !("body" in card)));
        assert.ok(all.records.every((card) => typeof card.bodyBytes === "number"));
        const withBody = JSON.parse(
            (await at(["card", "list", "--json", "--with-body"])).stdout
        );
        assert.ok(withBody.records.every((card) => "body" in card));

        const projected = JSON.parse(
            (await at(["card", "list", "--json", "--fields", "id,title"])).stdout
        );
        assert.deepEqual(Object.keys(projected.records[0]).sort(), ["id", "title"]);

        // Pagination reports what it left behind.
        const firstPage = JSON.parse(
            (await at(["card", "list", "--json", "--limit", "1"])).stdout
        );
        assert.equal(firstPage.records.length, 1);
        assert.equal(firstPage.offset, 0);
        assert.equal(firstPage.truncated, all.total > 1);
        const secondPage = JSON.parse(
            (await at(["card", "list", "--json", "--limit", "1", "--offset", "1"]))
                .stdout
        );
        assert.equal(secondPage.offset, 1);
        assert.notEqual(secondPage.records[0].id, firstPage.records[0].id);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("unknown options are refused instead of ignored", async () => {
    await assert.rejects(
        () => run(["card", "list", "--statuss", "doing", "--root", fixture]),
        (error) => {
            assert.match(error.stderr, /CLI_ARGUMENT_UNKNOWN/);
            assert.match(error.stderr, /--statuss/);
            return true;
        }
    );

    // A flag that belongs to another command is still unknown here.
    await assert.rejects(
        () => run(["card", "list", "--collection", "learnings", "--root", fixture]),
        (error) => {
            assert.match(error.stderr, /CLI_ARGUMENT_UNKNOWN/);
            return true;
        }
    );

    // Values that look like flags must not be mistaken for one.
    const titled = await run([
        "card",
        "list",
        "--json",
        "--fields",
        "id,status",
        "--root",
        fixture
    ]);
    assert.ok(JSON.parse(titled.stdout).records.length > 0);
});

/**
 * Flag validation and flag handling drifted apart, and only a real install
 * noticed.
 *
 * `assertKnownFlags` rejects anything absent from `COMMAND_FLAGS`, and that
 * table was seeded from the usage text rather than from the code. `init`
 * therefore refused `--areas`, `--docs` and `--no-scripts` while
 * `askInitOptions` was reading all three — the initializer rejecting its own
 * documented options. Nothing in the unit suite exercised it; the package
 * smoke test failed on a clean consumer.
 */
test("the flag table matches what each subcommand actually reads", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
        new URL("../bin/workfile.ts", import.meta.url),
        "utf8"
    );

    // Every helper that reads argv, and each takes the flag name as its first
    // argument — which is what makes the read visible here at all. A helper
    // that hardcoded its own flag would be invisible to this guard and could
    // sit in COMMAND_FLAGS unread, so the argument is a requirement, not a
    // style: `axisOptions("--axis")` rather than `axisOptions()`.
    const READ =
        /\b(?:option|listOption|dateOption|numberOption|has|repeatedNumbers|axisOptions)\(\s*"(--?[\w-]+)"/g;

    /** The balanced `{...}` starting at `open`. */
    const block = (text, open) => {
        let depth = 0;
        for (let index = open; index < text.length; index += 1) {
            if (text[index] === "{") depth += 1;
            else if (text[index] === "}" && (depth -= 1) === 0) {
                return text.slice(open, index + 1);
            }
        }
        return text.slice(open);
    };

    const bodies = new Map();
    for (const match of source.matchAll(/^(?:async )?function (\w+)\s*\(/gm)) {
        bodies.set(
            match[1],
            block(source, source.indexOf("{", match.index + match[0].length - 1))
        );
    }

    // A flag read through a helper is read by the branch that calls it:
    // `card list` never names `--status`, `filterCards` does.
    const flagsOf = (text, seen = new Set()) => {
        const flags = new Set([...text.matchAll(READ)].map((match) => match[1]));
        for (const call of text.matchAll(/\b(\w+)\s*\(/g)) {
            const name = call[1];
            if (!bodies.has(name) || seen.has(name)) continue;
            seen.add(name);
            for (const flag of flagsOf(bodies.get(name), seen)) flags.add(flag);
        }
        return flags;
    };

    const WORDS = {
        card: "cardCommand",
        doc: "documentCommand",
        changelog: "changelogCommand",
        memory: "memoryCommand",
        agents: "agentsCommand",
        ci: "ciCommand",
        claude: "claudeCommand",
        migrate: "migrationCommand",
        mcp: "mcpCommand"
    };

    const reads: Record<string, Set<string>> = {
        init: flagsOf(bodies.get("initCommand"))
    };
    for (const [word, handler] of Object.entries(WORDS)) {
        const body = bodies.get(handler);
        assert.ok(body, `handler not found: ${handler}`);
        const branches: Record<string, Set<string>> = {};
        const pattern = /if \(([^)]*action === "[^"]+"[^)]*)\)\s*\{/g;
        let match;
        while ((match = pattern.exec(body))) {
            const names = [
                ...match[1].matchAll(/action === "([^"]+)"/g)
            ].map((entry) => entry[1]);
            const inside = flagsOf(
                block(body, body.indexOf("{", match.index + match[0].length - 1))
            );
            for (const name of names) {
                branches[name] = new Set([...(branches[name] || []), ...inside]);
            }
        }
        // Anything read at the handler's own level applies to every branch,
        // which is precisely what makes it invisible — so it is asserted away
        // rather than tolerated.
        const inBranches = new Set(
            Object.values(branches).flatMap((set) => [...set])
        );
        const loose = [...flagsOf(body)].filter((flag) => !inBranches.has(flag));
        assert.deepEqual(
            loose.sort(),
            [],
            `${word} reads ${loose.join(", ")} above its branches, so every ` +
                "subcommand accepts them and most ignore them. Move the read " +
                "into the branches that use it."
        );
        for (const [name, flags] of Object.entries(branches)) {
            reads[`${word} ${name}`] = flags;
        }
    }

    const listed = new Set();
    const table = source.slice(
        source.indexOf("const COMMAND_FLAGS"),
        source.indexOf("\n};", source.indexOf("const COMMAND_FLAGS"))
    );
    const globals = source.slice(
        source.indexOf("const GLOBAL_FLAGS"),
        source.indexOf("];", source.indexOf("const GLOBAL_FLAGS"))
    );
    for (const match of globals.matchAll(/"(--?[\w-]+)"/g)) listed.add(match[1]);
    const global = new Set(listed);

    const declared: Record<string, Set<string>> = {};
    for (const entry of table.matchAll(/"([\w ]+)": \[([^\]]*)\]/g)) {
        declared[entry[1]] = new Set(
            [...entry[2].matchAll(/"(--?[\w-]+)"/g)].map((match) => match[1])
        );
    }

    // Direction one: nothing a subcommand reads may be missing from its row.
    // `init` refused `--areas`, `--docs` and `--no-scripts` while
    // `askInitOptions` was reading all three — the initializer rejecting its
    // own documented options, found by a package smoke test rather than here.
    const unlisted: string[] = [];
    for (const [key, flags] of Object.entries(reads)) {
        for (const flag of flags) {
            if (global.has(flag) || declared[key]?.has(flag)) continue;
            unlisted.push(`${key} ${flag}`);
        }
    }
    assert.deepEqual(unlisted.sort(), [], `read but refused: ${unlisted.join(", ")}`);

    // Direction two, which is the one that was missing: nothing may be listed
    // that the subcommand never reads. Without it the table drifts into a union
    // and every subcommand accepts its siblings' flags and ignores them.
    const unread: string[] = [];
    for (const [key, flags] of Object.entries(declared)) {
        if (!(key in reads)) continue;
        for (const flag of flags) {
            if (!reads[key].has(flag)) unread.push(`${key} ${flag}`);
        }
    }
    assert.deepEqual(unread.sort(), [], `accepted but ignored: ${unread.join(", ")}`);

    // And every row must name a subcommand that exists, or a command word that
    // takes none.
    const flat = new Set(["doctor", "ui", "next", "schema", "upgrade", "version", "search", "init"]);
    const orphans = Object.keys(declared).filter(
        (key) => !(key in reads) && !flat.has(key)
    );
    assert.deepEqual(orphans, [], `listed for no subcommand: ${orphans.join(", ")}`);
});

/**
 * `--dry-run` is global, so it parsed everywhere and was honoured by five
 * commands.
 *
 * The other subcommands read it never and acted anyway. `changelog release
 * 0.7.0 --dry-run` printed `REL-0003 released 0.7.0 (73 fragments)` — which
 * reads like a preview — after having already moved all 73 out of
 * `unreleased/`. A flag whose whole purpose is "show me first" must not be
 * accepted by something that cannot do that.
 */
test("--dry-run is refused where it is not implemented", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
        new URL("../bin/workfile.ts", import.meta.url),
        "utf8"
    );

    const table = source.slice(
        source.indexOf("const DRY_RUN_COMMANDS"),
        source.indexOf("]);", source.indexOf("const DRY_RUN_COMMANDS"))
    );
    const declared = [...table.matchAll(/"([\w -]+)"/g)].map((match) => match[1]);
    assert.ok(declared.length >= 6, "expected the supported subcommands to be listed");

    const HANDLERS = {
        card: "cardCommand",
        agents: "agentsCommand",
        ci: "ciCommand",
        claude: "claudeCommand",
        migrate: "migrationCommand"
    };

    // Each entry really does read the flag; a stale one re-opens the hole the
    // guard exists to close, and a missing one refuses a preview that works —
    // which is what `card reap --dry-run` did, while naming a binary that has
    // not existed since the rename.
    for (const key of declared) {
        const [word, action] = key.split(" ");
        const handler = source.indexOf(
            `async function ${HANDLERS[word] || `${word}Command`}`
        );
        let region = handler === -1 ? source : source.slice(handler, handler + 12000);
        if (action) {
            const branch = region.indexOf(`action === "${action}"`);
            assert.notEqual(branch, -1, `${key} names no branch that exists`);
            region = region.slice(branch, branch + 1200);
        }
        assert.match(
            region,
            /has\("--dry-run"\)|dryRun:/,
            `${key} is listed as supporting --dry-run but never reads it`
        );
    }

    assert.match(source, /assertDryRunSupported\(command, subcommand\(\)\);/);
});

test("search is lexical by default and hybrid when the config declares a provider", async () => {
    const lexical = JSON.parse(
        (await run(["search", "example", "--root", fixture, "--json"])).stdout
    );
    assert.equal(lexical.mode, "lexical");

    await assert.rejects(
        run(["search", "example", "--root", fixture, "--mode", "hybrid"]),
        (error) => error.stderr.includes("SEARCH_PROVIDER_UNAVAILABLE")
    );

    const root = await mkdtemp(join(tmpdir(), "workfile-cli-search-"));
    try {
        await cp(fixture, root, { recursive: true });
        await writeFile(
            join(root, "project.config.mjs"),
            `export default {
    schemaVersion: 2,
    name: "CLI search",
    cards: { areas: ["api", "web", "infra", "docs"] }
};

export const integrations = [
    {
        id: "cli-search",
        semanticSearchProvider: {
            id: "cli-search",
            async search({ records }) {
                return records
                    .filter((record) => record.id === "T-0002")
                    .map((record) => ({ id: record.id, score: 1 }));
            }
        }
    }
];
`
        );
        const hybrid = JSON.parse(
            (
                await run([
                    "search",
                    "semantic-only-query",
                    "--root",
                    root,
                    "--json"
                ])
            ).stdout
        );
        assert.equal(hybrid.mode, "hybrid");
        assert.equal(hybrid.provider, "cli-search");
        assert.equal(hybrid.records[0].id, "T-0002");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("card renumber --duplicates and doctor --fix heal a merged ID collision", async () => {
    const { card } = await import("./support/workspace.ts");
    const root = await mkdtemp(join(tmpdir(), "workfile-cli-renumber-"));
    try {
        await cp(fixture, root, { recursive: true });
        await writeFile(
            join(root, ".project", "cards", "T-0001-collision.md"),
            card("T-0001", { created: "2026-07-28" }, "Born on a branch.")
        );
        const healed = JSON.parse(
            (
                await run([
                    "card",
                    "renumber",
                    "--duplicates",
                    "--root",
                    root,
                    "--actor",
                    "cli-test",
                    "--json"
                ])
            ).stdout
        );
        assert.equal(healed.moves.length, 1);
        assert.equal(healed.moves[0].from, "T-0001");

        await writeFile(
            join(root, ".project", "cards", "T-0002-collision.md"),
            card("T-0002", { created: "2026-07-28" }, "Second branch.")
        );
        const doctor = JSON.parse(
            (
                await run([
                    "doctor",
                    "--fix",
                    "--root",
                    root,
                    "--actor",
                    "cli-test",
                    "--json"
                ])
            ).stdout
        );
        assert.equal(doctor.fixed.moves.length, 1);
        assert.equal(doctor.fixed.moves[0].from, "T-0002");
        assert.ok(
            !doctor.issues.some(
                (issue) => issue.code === "duplicate-record-id"
            )
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// T-0052. `--parent` sat in COMMAND_FLAGS.card and was read by nothing on the
// create path, so it cleared the unknown-flag guard and was dropped in silence:
// the card came out with no parent and the command exited 0. Asserting the one
// field would not have caught the next one, so this walks the whole mutable
// surface — add a patchable field without a create flag and this fails.
const CLAIM_MANAGED_FIELDS = ["claimed_by", "claimed_at"];

const CREATE_FLAG_COVERAGE = {
    title: ["--title", "Fully specified card"],
    status: ["--status", "next"],
    type: ["--type", "bug"],
    priority: ["--priority", "high"],
    area: ["--area", "infra"],
    parent: ["--parent", "T-0001"],
    depends: ["--depends", "T-0001"],
    milestone: ["--milestone", "0.2.0"],
    source: ["--source", "docs/architecture.md"],
    tags: ["--tags", "alpha,beta"],
    effort: ["--effort", "M"],
    scope: ["--scope", "packages/api,packages/sdk"],
    start: ["--start", "2026-08-01"],
    due: ["--due", "2026-08-31"],
    related: ["--related", "T-0001"],
    // Any record id, not only a card: a decision spawns work as often as a
    // card does, and restricting the edge to cards throws away the half of the
    // provenance tree that explains why the work exists.
    origin: ["--origin", "T-0001,ADR-0001"]
};

test("card create reaches every field the mutation accepts", async () => {
    const { CARD_PATCHABLE_FIELDS } = await import("../dist/src/index.js");
    const covered = Object.keys(CREATE_FLAG_COVERAGE);
    assert.deepEqual(
        [...CARD_PATCHABLE_FIELDS].sort(),
        [...covered, ...CLAIM_MANAGED_FIELDS].sort(),
        "a patchable card field is not reachable from a `card create` flag"
    );

    const root = await mkdtemp(join(tmpdir(), "workfile-cli-create-flags-"));
    try {
        await cp(fixture, root, { recursive: true });
        const created = JSON.parse(
            (
                await run([
                    "card",
                    "create",
                    "--root",
                    root,
                    ...Object.values(CREATE_FLAG_COVERAGE).flat(),
                    "--json"
                ])
            ).stdout
        );

        assert.equal(created.title, "Fully specified card");
        assert.equal(created.status, "next");
        assert.equal(created.type, "bug");
        assert.equal(created.priority, "high");
        assert.equal(created.area, "infra");
        assert.equal(created.parent, "T-0001");
        assert.equal(created.milestone, "0.2.0");
        assert.equal(created.source, "docs/architecture.md");
        assert.equal(created.effort, "M");
        assert.equal(created.start, "2026-08-01");
        assert.equal(created.due, "2026-08-31");
        assert.deepEqual(created.depends, ["T-0001"]);
        assert.deepEqual(created.tags, ["alpha", "beta"]);
        assert.deepEqual(created.scope, ["packages/api", "packages/sdk"]);
        assert.deepEqual(created.related, ["T-0001"]);
        assert.deepEqual(created.origin, ["T-0001", "ADR-0001"]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// T-0056. The one-call form existed and only SPEC.md mentioned it, so an agent
// reading `--help` built every card in three calls and pushed bodies through
// shell heredocs. The help text is the fix, so the help text is the assertion.
test("card create teaches the --json-input form and honours it", async () => {
    const help = await run(["card", "--help"]);
    assert.match(help.stdout, /card create --json-input FILE/);

    const root = await mkdtemp(join(tmpdir(), "workfile-cli-create-json-"));
    try {
        await cp(fixture, root, { recursive: true });
        const input = join(root, "card.json");
        const body = "# Heading\n\nBackticks `x`, a $variable and «angle quotes».";
        await writeFile(
            input,
            JSON.stringify({
                title: "Created in one call",
                area: "infra",
                parent: "T-0001",
                source: "docs/architecture.md",
                tags: ["x", "y"],
                body
            })
        );
        const created = JSON.parse(
            (
                await run([
                    "card",
                    "create",
                    "--root",
                    root,
                    "--json-input",
                    input,
                    "--json"
                ])
            ).stdout
        );
        assert.equal(created.parent, "T-0001");
        assert.equal(created.source, "docs/architecture.md");
        assert.deepEqual(created.tags, ["x", "y"]);
        assert.equal(created.body.trim(), body);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// T-0055. The accepted values were computed at the point of failure and only
// `--json` printed them, so a text caller learned the enum by going to read
// project.config.mjs. The document enums did not even carry them.
test("enum errors name the accepted values on both surfaces", async () => {
    const area = await outcome([
        "card", "create", "--title", "Bad", "--area", "treasury", "--root", fixture
    ]);
    assert.equal(area.code, 1);
    assert.match(area.stderr, /CARD_ENUM_INVALID: Invalid area: treasury/);
    assert.match(area.stderr, /valid values: api, web, infra, docs/);

    const kindJson = await outcome([
        "doc", "create", "--title", "Bad", "--kind", "report", "--root", fixture, "--json"
    ]);
    assert.equal(kindJson.code, 1);
    const payload = JSON.parse(kindJson.stderr);
    assert.equal(payload.error.code, "DOC_KIND_INVALID");
    assert.ok(payload.error.details.allowed.includes("research"));

    const kindText = await outcome([
        "doc", "create", "--title", "Bad", "--kind", "report", "--root", fixture
    ]);
    assert.equal(kindText.code, 1);
    assert.match(kindText.stderr, /valid values: .*research/);
});

// T-0053. `--severity` filtered the printed list and nothing else: the headline
// read off unfiltered counts and the rule grouping walked unfiltered issues, so
// on a repository with hundreds of inherited warnings the filter returned the
// one line you wanted wrapped in everything you had just excluded.
test("doctor --severity filters the headline and the rule grouping too", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-cli-severity-"));
    try {
        await cp(fixture, root, { recursive: true });
        // One warning (an unresolvable search provider) and one error (a card
        // whose source is not in the repository).
        await writeFile(
            join(root, "project.config.mjs"),
            `export default {
    schemaVersion: 2,
    name: "Golden workspace",
    language: "es",
    cards: { areas: ["api", "web", "infra", "docs"] },
    search: { provider: "absent-provider" }
};
`
        );
        await run([
            "card",
            "create",
            "--root",
            root,
            "--title",
            "Points at nothing",
            "--source",
            "docs/does-not-exist.md"
        ]);

        const all = JSON.parse(
            (await outcome(["doctor", "--root", root, "--json"])).stdout
        );
        // The fixture carries its own warnings on top of the injected one, so
        // the assertions are relative: what matters is that the filter moves
        // every part of the report together, not that the corpus has a
        // particular size.
        assert.equal(all.counts.error, 1);
        assert.ok(all.counts.warning >= 1);
        assert.ok(
            all.issues.some(
                (issue) => issue.code === "search-provider-unresolved"
            )
        );
        assert.equal(all.suppressed, undefined);

        const errorsOnly = JSON.parse(
            (
                await outcome([
                    "doctor",
                    "--root",
                    root,
                    "--severity",
                    "error",
                    "--json"
                ])
            ).stdout
        );
        assert.equal(errorsOnly.counts.error, 1);
        assert.equal(errorsOnly.counts.warning, 0);
        assert.equal(
            errorsOnly.suppressed,
            all.counts.warning + all.counts.info
        );
        assert.ok(
            errorsOnly.issues.every((issue) => issue.severity === "error"),
            "a filtered report still carried non-error issues"
        );

        const text = (
            await outcome(["doctor", "--root", root, "--severity", "error"])
        ).stdout;
        assert.match(text, /Workfile doctor: 1 errors, 0 warnings/);
        assert.match(text, /missing-source/);
        assert.doesNotMatch(
            text,
            /search-provider-unresolved/,
            "the rule grouping ignored --severity"
        );
        assert.match(
            text,
            new RegExp(
                `${all.counts.warning + all.counts.info} below --severity error suppressed`
            )
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// T-0057. The ranking shipped inside the MCP tool module, so `workfile next`
// exited 2 with the usage banner and a session driving the CLI never met it.
// Both surfaces call one service now, which is what the test pins.
test("next ranks ready work on the CLI, claimed-by-you first", async () => {
    const { card } = await import("./support/workspace.ts");
    const root = await mkdtemp(join(tmpdir(), "workfile-cli-next-"));
    try {
        await cp(fixture, root, { recursive: true });
        await writeFile(
            join(root, ".project", "cards", "T-0010-blocked.md"),
            card("T-0010", { status: "backlog", depends: ["T-0011"] }, "Blocked.")
        );
        await writeFile(
            join(root, ".project", "cards", "T-0011-unmet.md"),
            card("T-0011", { status: "backlog" }, "The dependency.")
        );
        await writeFile(
            join(root, ".project", "cards", "T-0012-mine.md"),
            card(
                "T-0012",
                {
                    status: "doing",
                    priority: "low",
                    claimed_by: "cli-test",
                    claimed_at: "2026-07-30T10:00:00.000Z"
                },
                "Already started."
            )
        );
        await writeFile(
            join(root, ".project", "cards", "T-0013-theirs.md"),
            card(
                "T-0013",
                {
                    status: "next",
                    priority: "critical",
                    claimed_by: "someone-else",
                    claimed_at: "2026-07-30T10:00:00.000Z"
                },
                "Someone else has it."
            )
        );

        const ranked = JSON.parse(
            (
                await run([
                    "next",
                    "--root",
                    root,
                    "--actor",
                    "cli-test",
                    "--json"
                ])
            ).stdout
        );
        const ids = ranked.records.map((record) => record.id);

        assert.equal(ids[0], "T-0012", "work already claimed by the actor ranks first");
        assert.ok(
            !ids.includes("T-0013"),
            "a card claimed by another actor was offered"
        );
        assert.ok(
            !ids.includes("T-0010"),
            "a card with an unmet dependency was offered"
        );
        assert.match(
            ranked.records[0].reason,
            /already claimed by you/,
            "the ranking did not say why"
        );

        const text = (await run(["next", "--root", root, "--actor", "cli-test"])).stdout;
        assert.match(text, /T-0012/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// T-0054. Creating a card derives its filename from the title and retitling
// never revisited it, so a file could sit named after work it no longer
// described — and doctor said nothing. The repair is opt-in because renaming on
// every title edit churns history and breaks open editor buffers.
test("doctor reports a filename that outlived its title, and --fix renames it", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-cli-reslug-"));
    try {
        await cp(fixture, root, { recursive: true });
        const changes = join(root, "retitle.json");
        await writeFile(
            changes,
            JSON.stringify({ title: "Something else entirely" })
        );
        await run(["card", "patch", "T-0001", "--root", root, "--json-input", changes]);

        const stale = JSON.parse(
            (await outcome(["doctor", "--root", root, "--json"])).stdout
        );
        const drift = stale.issues.find((issue) => issue.code === "filename-stale");
        assert.ok(drift, "doctor stayed quiet about the drift");
        assert.equal(drift.severity, "warning");
        assert.match(drift.message, /T-0001-something-else-entirely\.md/);

        const fixed = JSON.parse(
            (
                await outcome([
                    "doctor",
                    "--root",
                    root,
                    "--fix",
                    "--actor",
                    "cli-test",
                    "--json"
                ])
            ).stdout
        );
        // Both fixture files were named by hand rather than derived from their
        // titles, so the pass normalizes them together with the retitled card —
        // including the archived one. That is the intended reach: the rule knows
        // "this filename is not what the title would produce", and cannot tell a
        // hand-named file from a drifted one.
        assert.deepEqual(fixed.fixed.renamed, [
            {
                id: "T-0001",
                from: "T-0001-example.md",
                to: "T-0001-something-else-entirely.md"
            },
            {
                id: "T-0002",
                from: "T-0002-completed.md",
                to: "T-0002-completed-task.md"
            }
        ]);

        const after = JSON.parse(
            (await outcome(["doctor", "--root", root, "--json"])).stdout
        );
        assert.ok(
            !after.issues.some((issue) => issue.code === "filename-stale"),
            "the rename did not clear the rule"
        );
        const shown = JSON.parse(
            (await run(["card", "show", "T-0001", "--root", root, "--json"])).stdout
        );
        assert.equal(shown.file, "T-0001-something-else-entirely.md");
        assert.equal(shown.title, "Something else entirely");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// T-0058. doctor reported absolute state, so on a repository with inherited
// debt a clean run and an unchanged dirty one looked alike and nothing could
// require it. The baseline turns "is this clean" into "did I make it worse".
test("doctor --new gates on what appeared since the accepted baseline", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-cli-baseline-"));
    try {
        await cp(fixture, root, { recursive: true });
        await run([
            "card", "create", "--root", root,
            "--title", "Inherited debt", "--source", "docs/missing-a.md"
        ]);

        const missing = await outcome(["doctor", "--root", root, "--new", "--json"]);
        assert.equal(missing.code, 1);
        assert.equal(
            JSON.parse(missing.stderr).error.code,
            "DOCTOR_BASELINE_MISSING",
            "--new without a baseline must say so rather than call everything new"
        );

        const accepted = JSON.parse(
            (await run(["doctor", "--root", root, "--accept-baseline", "--json"])).stdout
        );
        assert.ok(accepted.baseline.accepted > 0);

        // The committed file is meant to be read in a diff, not decoded.
        const written = JSON.parse(
            await readFile(join(root, ".project", "doctor-baseline.json"), "utf8")
        );
        assert.equal(written.version, 1);
        assert.ok(
            written.issues.some(
                (entry) =>
                    entry.code === "missing-source" &&
                    entry.id === "T-0003" &&
                    entry.count === 1
            ),
            "the baseline did not record readable fields"
        );

        const quiet = await outcome(["doctor", "--root", root, "--new", "--json"]);
        assert.equal(quiet.code, 0, "an unchanged repository must pass the gate");
        const quietReport = JSON.parse(quiet.stdout);
        assert.deepEqual(quietReport.issues, []);
        assert.equal(quietReport.baseline.known, accepted.baseline.accepted);
        assert.equal(quietReport.baseline.resolved, 0);

        await run([
            "card", "create", "--root", root,
            "--title", "Freshly broken", "--source", "docs/brand-new.md"
        ]);
        const regressed = await outcome(["doctor", "--root", root, "--new", "--json"]);
        assert.equal(regressed.code, 1, "a new issue must fail the gate");
        const report = JSON.parse(regressed.stdout);
        assert.equal(report.issues.length, 1);
        assert.equal(report.issues[0].id, "T-0004");
        assert.equal(report.counts.error, 1);

        // Two issues from one rule against two cards stay distinct, so clearing
        // the older one is reported as resolved rather than cancelling the new.
        await mkdir(join(root, "docs"), { recursive: true });
        await writeFile(join(root, "docs", "missing-a.md"), "# now real\n");
        const partly = JSON.parse(
            (await outcome(["doctor", "--root", root, "--new", "--json"])).stdout
        );
        assert.equal(partly.baseline.resolved, 1);
        assert.equal(partly.issues.length, 1, "the resolved issue masked the new one");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * Through the CLI because the rule is only half in `diagnoseCards`.
 *
 * `origin` accepts any record kind, and that module is handed cards alone — so
 * the set it resolves against is assembled a layer up, in `runDoctor`, from the
 * whole index. A unit test against `diagnoseCards` would pass with that wiring
 * cut and every non-card origin reported as dangling.
 *
 * Which is what the LRN-0001 case guards. It is the one assertion here that
 * fails if the known set is ever narrowed back to card IDs, and the failure it
 * describes is silent: a card citing the decision it came out of, told the
 * decision does not exist.
 */
test("doctor resolves an origin against every record kind, not just cards", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-origin-"));
    await cp(fixture, root, { recursive: true });
    try {
        const learning = (
            await run([
                "memory", "add", "learnings", "--root", root,
                "--title", "Something worth knowing"
            ])
        ).stdout;
        assert.match(learning, /LRN-0001/, "the fixture gained no learning to cite");

        await run([
            "card", "create", "--root", root,
            "--title", "Came out of a card and a learning",
            "--origin", "T-0001,LRN-0001"
        ]);
        const clean = JSON.parse(
            (await outcome(["doctor", "--root", root, "--json"])).stdout
        );
        assert.deepEqual(
            clean.issues.filter((issue) => issue.code.endsWith("origin")),
            [],
            "an origin naming a real card and a real learning was reported as broken"
        );

        await run([
            "card", "create", "--root", root,
            "--title", "Came out of nothing at all",
            "--origin", "T-9999"
        ]);
        const dangling = JSON.parse(
            (await outcome(["doctor", "--root", root, "--json"])).stdout
        ).issues.filter((issue) => issue.code === "missing-origin");
        assert.equal(dangling.length, 1);
        assert.equal(dangling[0].severity, "warning");
        assert.match(dangling[0].message, /T-9999/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// Found while testing the above: a boolean flag left off the no-value list is
// assumed to consume the next token, so it swallowed the flag after it.
// `doctor --fix --bogus` accepted `--bogus` and ran the repair anyway.
test("a boolean flag does not swallow the flag after it", async () => {
    const failed = await outcome(["doctor", "--fix", "--bogus", "--root", fixture]);
    assert.equal(failed.code, 1);
    assert.match(failed.stderr, /CLI_ARGUMENT_UNKNOWN/);
    assert.match(failed.stderr, /--bogus/);
});

/*
 * `workfile` and `wf` are one file under two bin names, so the CLI reads back
 * the name it was invoked under and answers in it. Exercised through a symlink
 * because that is what npm writes into `node_modules/.bin` on POSIX; the
 * packaged form is asserted end to end in package-smoke.
 *
 * Skipped on Windows, where creating a symlink needs a privilege the test
 * runner may not have and npm writes a `.cmd` shim instead — that shim passes
 * this file's real path, so the name falls back to `workfile` by design.
 */
test("the CLI answers in the name it was invoked under", { skip: process.platform === "win32" }, async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-alias-"));
    try {
        const alias = join(root, "wf");
        await symlink(cli, alias);
        const short = await execute(process.execPath, [alias, "card", "--help"], {
            encoding: "utf8"
        });
        assert.match(short.stdout, /^ {2}wf card list/m);
        assert.doesNotMatch(
            short.stdout,
            /^ {2}workfile /m,
            "the help still teaches the name the caller did not type"
        );

        // The hint a failing command prints is the other half: it is the line a
        // reader is most likely to copy.
        const failed = await outcome(["card", "list", "--nonsense"]);
        assert.match(failed.stderr, /Run `workfile card --help`/);
        const failedShort = await execute(
            process.execPath,
            [alias, "card", "list", "--nonsense"],
            { encoding: "utf8" }
        ).then(
            () => ({ stderr: "" }),
            (error: { stderr?: string }) => ({ stderr: error.stderr ?? "" })
        );
        assert.match(failedShort.stderr, /Run `wf card --help`/);

        // The canonical name is unaffected by the alias existing.
        const long = await run(["card", "--help"]);
        assert.match(long.stdout, /^ {2}workfile card list/m);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * A filter that cannot parse its input has two honest answers, and gave
 * neither.
 *
 * `--updated-since 2026-7-1` compared as a raw string against `YYYY-MM-DD`,
 * matched nothing, and exited 0 with `"total": 0`. `--limit abc` produced
 * `NaN`, and `slice(NaN, NaN)` returned an empty page under `"total": 3` — the
 * count said three records existed and none came back. Both read to an agent as
 * "nothing here", which is the one answer a broken filter must never give: a
 * wrong result that looks valid is worse than an error, because nothing
 * downstream can tell.
 */
test("a filter refuses a value it cannot parse instead of matching nothing", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "workfile-filters-"));
    try {
        await cp(fixture, workspace, { recursive: true });
        for (const args of [
            ["card", "list", "--updated-since", "2026-7-1"],
            ["card", "list", "--updated-since", "last week"],
            ["card", "list", "--limit", "abc"],
            ["card", "list", "--offset", "abc"],
            ["card", "list", "--limit", "-5"],
            ["next", "--limit", "many"],
            ["doctor", "--max-issues", "lots"]
        ]) {
            const result = await outcome([...args, "--root", workspace]);
            assert.equal(
                result.code,
                1,
                `${args.join(" ")} exited 0 instead of refusing`
            );
            assert.match(result.stderr + result.stdout, /CLI_OPTION_INVALID/);
        }

        // A well-formed value is untouched.
        const listed = await outcome([
            "card",
            "list",
            "--updated-since",
            "2020-01-01",
            "--limit",
            "2",
            "--json",
            "--root",
            workspace
        ]);
        assert.equal(listed.code, 0);
        assert.equal(JSON.parse(listed.stdout).records.length, 2);

        // A timestamp is read as its date. Records store `updated` as a plain
        // date, so comparing `2026-08-01T10:00:00Z` as a string sorted it after
        // `2026-08-01` and dropped everything changed that day — the boundary a
        // caller is most likely to hit.
        await outcome([
            "card",
            "create",
            "--title",
            "Written today",
            "--area",
            "api",
            "--root",
            workspace
        ]);
        const sameDay = await outcome([
            "card",
            "list",
            "--updated-since",
            `${new Date().toISOString().slice(0, 10)}T23:59:59Z`,
            "--json",
            "--root",
            workspace
        ]);
        assert.equal(sameDay.code, 0);
        assert.ok(
            JSON.parse(sameDay.stdout).records.length > 0,
            "a timestamp must not exclude the day it names"
        );
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
});

/** `COMMAND_FLAGS` and `DEFAULT_SUBCOMMAND`, read out of the un-importable bin. */
async function dispatch() {
    const source = await readFile(
        new URL("../bin/workfile.ts", import.meta.url),
        "utf8"
    );
    const between = (name: string, close: string) => {
        const start = source.indexOf(`const ${name}`);
        return source.slice(start, source.indexOf(close, start));
    };
    const keys = [
        ...between("COMMAND_FLAGS", "\n};").matchAll(/^ {4}"([^"]+)":/gm)
    ].map((match) => match[1]);
    const subcommands = new Map<string, string[]>();
    for (const key of keys) {
        const [word, ...rest] = key.split(" ");
        if (!rest.length) continue;
        subcommands.set(word, [...(subcommands.get(word) ?? []), rest.join(" ")]);
    }
    const defaults = Object.fromEntries(
        [...between("DEFAULT_SUBCOMMAND", "\n};").matchAll(/^ {4}(\w+): "(\w+)"/gm)].map(
            (match) => [match[1], match[2]]
        )
    );
    return { keys, subcommands, defaults };
}

/**
 * Every branching word answers for its own subcommand, before anything else.
 *
 * Three behaviours where there should have been one. `card` and `doc` demanded
 * an ID first, so `workfile doc index` answered `doc index requires an ID` —
 * telling a reader to go find an identifier for a subcommand that does not
 * exist, and hiding `docs index` in the spec until a documentation test found
 * it. Bare, six words interpolated the missing subcommand into the message and
 * printed the literal `card undefined requires an ID`. The remaining three ran
 * a default, unchecked: `workfile mcp --nonsense` served, `workfile migrate
 * --nonsense` ran the import, `workfile claude --force` exited 0 having
 * discarded the flag — while `migrate apply --nonsense` was refused correctly.
 *
 * The words come from `COMMAND_FLAGS` and the defaults from
 * `DEFAULT_SUBCOMMAND`, so this covers whatever the tables hold rather than a
 * list written once and left behind.
 */
test("every command word answers for its own subcommand", async () => {
    const { subcommands, defaults } = await dispatch();
    assert.deepEqual(
        [...subcommands.keys()].sort(),
        ["agents", "card", "changelog", "ci", "claude", "doc", "mcp", "memory", "migrate"],
        "the set of branching words changed"
    );
    assert.deepEqual(
        Object.keys(defaults).sort(),
        ["claude", "mcp", "migrate"],
        "the set of words that run a default changed"
    );

    for (const [word, actions] of subcommands) {
        const bogus = await outcome([word, "zzz", "--root", fixture, "--json"]);
        assert.equal(bogus.code, 1, `${word} zzz exited ${bogus.code}`);
        const reported = JSON.parse(bogus.stderr).error;
        assert.equal(
            reported.code,
            "CLI_COMMAND_UNKNOWN",
            `${word} zzz answered ${reported.code}: ${reported.message}`
        );
        for (const action of actions) {
            assert.ok(
                reported.message.includes(action),
                `${word} zzz does not offer ${action}: ${reported.message}`
            );
        }

        // Only for the words that do not run something: bare `mcp` serves, and
        // asking it what it does with no subcommand never returns.
        if (!defaults[word]) {
            const bare = await outcome([word, "--root", fixture, "--json"]);
            const missing = JSON.parse(bare.stderr).error;
            assert.equal(
                missing.code,
                "CLI_COMMAND_REQUIRED",
                `bare ${word} answered ${missing.code}: ${missing.message}`
            );
            continue;
        }
        // A word that runs something must validate what it was handed, and say
        // which subcommand it validated against.
        const stray = await outcome([word, "--nonsense", "--root", fixture, "--json"]);
        const refused = JSON.parse(stray.stderr).error;
        assert.equal(
            refused.code,
            "CLI_ARGUMENT_UNKNOWN",
            `bare ${word} accepted --nonsense`
        );
        assert.match(refused.message, new RegExp(`${word} ${defaults[word]}`));
    }

    // Aliases reach the same guards, or they are not aliases. `serve` reached
    // none of them: `workfile serve --nonsense` started the server.
    for (const [alias, real] of [["docs", "doc"], ["history", "changelog"]]) {
        const aliased = await outcome([alias, "zzz", "--root", fixture, "--json"]);
        assert.match(JSON.parse(aliased.stderr).error.message, new RegExp(`Unknown ${real} command`));
    }
    const served = await outcome(["serve", "--nonsense", "--root", fixture, "--json"]);
    assert.equal(JSON.parse(served.stderr).error.code, "CLI_ARGUMENT_UNKNOWN");
    assert.match(JSON.parse(served.stderr).error.message, /"ui"/);
});

/**
 * No subcommand reports a missing argument as a missing record.
 *
 * `card show` sat above its handler's own ID guard, so it looked up the record
 * `undefined` and answered `Card not found: undefined` — a caller who forgot
 * the argument told that the argument does not exist. Four others did the
 * same. The positional readers now refuse a flag in an argument's place, which
 * is what turned `Card not found: --json` into a visible defect rather than a
 * plausible-looking answer.
 *
 * Run against every key in the table, because the five were found by sweeping
 * and not by reading.
 */
test("no subcommand reports a missing argument as a missing record", async () => {
    const { keys } = await dispatch();
    const workspace = await mkdtemp(join(tmpdir(), "workfile-argv-"));
    await cp(fixture, workspace, { recursive: true });
    try {
        // The three that block by design: they are servers, and take no
        // argument. Everything else must answer. `card write` reads its body
        // from stdin when no `--body-file` is given, so a subcommand that gets
        // past its own argument check with nothing to work on does not fail —
        // it waits forever. That is how this defect presented when the fix was
        // reverted to check it, and a suite that hangs reports nothing at all,
        // so the timeout is part of the assertion rather than a safety net.
        const runnable = keys.filter(
            (key) => !["mcp serve", "mcp stdio", "ui"].includes(key)
        );
        const attempt = (args: string[]) =>
            new Promise<{ output: string; killed: boolean }>((settle) => {
                execFile(
                    process.execPath,
                    [cli, ...args],
                    { encoding: "utf8", timeout: 20_000, killSignal: "SIGKILL" },
                    (error, stdout, stderr) => {
                        settle({
                            output: `${stdout}${stderr}`,
                            killed: Boolean(
                                (error as { killed?: boolean } | null)?.killed
                            )
                        });
                    }
                );
            });

        const wrong: string[] = [];
        for (let index = 0; index < runnable.length; index += 8) {
            await Promise.all(
                runnable.slice(index, index + 8).map(async (key) => {
                    const { output, killed } = await attempt([
                        ...key.split(" "),
                        "--root",
                        workspace,
                        "--json"
                    ]);
                    if (killed) {
                        wrong.push(`workfile ${key} never answered`);
                    } else if (/undefined/.test(output)) {
                        wrong.push(`workfile ${key} → ${output.trim().slice(0, 120)}`);
                    }
                })
            );
        }
        assert.deepEqual(wrong, [], `\n${wrong.join("\n")}\n`);

        // A flag is not an identifier. `workfile card show --json` answered
        // `Card not found: --json`, and the assertion that `card unknown` is
        // an unknown command passed only because the `--root` after it stood
        // in for the id that was never given.
        const flagAsId = await outcome(["card", "show", "--json", "--root", workspace]);
        assert.equal(
            JSON.parse(flagAsId.stderr).error.code,
            "CLI_ARGUMENT_REQUIRED",
            "a flag in the id position was taken for an id"
        );
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
});

/**
 * `card reopen --status doing` had no way to name who was reopening.
 *
 * The flag guard passed `--actor` — it was listed for the subcommand — and the
 * branch never read it, so the caller was told the option was valid and then
 * told its value was missing. Narrowing the table to what each branch reads
 * turned that into `CLI_ARGUMENT_UNKNOWN`, which is honest and still leaves
 * reopening into work impossible from the CLI. The identity resolves itself
 * now, and `--actor` is wired for the caller acting on someone else's behalf.
 */
test("card reopen carries an actor into doing, resolved or given", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "workfile-reopen-"));
    await cp(fixture, workspace, { recursive: true });
    const park = () =>
        outcome(["card", "transition", "T-0001", "done", "--force", "--root", workspace]);
    const status = async () => {
        const shown = await outcome(["card", "show", "T-0001", "--json", "--root", workspace]);
        return JSON.parse(shown.stdout);
    };
    try {
        await park();
        const resolved = await outcome([
            "card", "reopen", "T-0001", "--status", "doing", "--root", workspace
        ]);
        assert.equal(resolved.code, 0, resolved.stderr);
        const own = await status();
        assert.equal(own.status, "doing");
        assert.ok(own.claimed_by, "reopening into doing recorded no claim");

        await park();
        const named = await outcome([
            "card", "reopen", "T-0001",
            "--status", "doing", "--actor", "ci-bot", "--root", workspace
        ]);
        assert.equal(named.code, 0, named.stderr);
        assert.equal((await status()).claimed_by, "ci-bot");
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
});

/**
 * The resolved root, on demand, before anything writes.
 *
 * SPEC stated it normatively — "commands that mutate data MUST print the
 * resolved workspace root in verbose mode" — and nothing implemented it. After
 * the flag tables were re-keyed nothing could: `--verbose` was listed for `ui`
 * alone, where it means request logging, so `card create --verbose` was
 * refused outright. The requirement was false in both directions at once.
 *
 * Resolution walks five steps and picking the wrong ancestor writes into the
 * wrong repository, which stops being hypothetical the moment two checkouts
 * are open. Global rather than per-mutation: a caller should not have to know
 * which commands qualify, and a read answering the same question costs
 * nothing. On stderr, so `--json` on stdout stays machine-readable.
 */
test("--verbose names the workspace a command resolved, without spoiling --json", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "workfile-verbose-"));
    await cp(fixture, workspace, { recursive: true });
    try {
        const mutation = await outcome([
            "card", "create", "--title", "Verbose probe",
            "--area", "api", "--verbose", "--root", workspace
        ]);
        assert.equal(mutation.code, 0, mutation.stderr);
        // `includes`, not a RegExp: a Windows temp path is full of
        // backslashes, and each one becomes a regex escape.
        assert.ok(
            mutation.stderr.includes(`Workspace: ${workspace}`),
            `a mutation ran without naming the workspace it resolved: ${mutation.stderr}`
        );

        const listed = await outcome([
            "card", "list", "--verbose", "--json", "--root", workspace
        ]);
        assert.equal(listed.code, 0, listed.stderr);
        assert.ok(listed.stderr.includes(`Workspace: ${workspace}`), listed.stderr);
        // The whole point of the stderr channel: stdout is still a document.
        assert.ok(
            JSON.parse(listed.stdout).records.length > 0,
            "--verbose corrupted the machine-readable output"
        );

        // Refusing it anywhere is the state this replaced.
        for (const command of [["doctor"], ["card", "list"], ["agents", "status"]]) {
            const accepted = await outcome([...command, "--verbose", "--root", workspace]);
            assert.notEqual(
                accepted.stderr.includes("CLI_ARGUMENT_UNKNOWN"),
                true,
                `${command.join(" ")} still refuses --verbose`
            );
        }
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
});

/**
 * End to end because the repair is a CLI verb, and because the shape it repairs
 * cannot be produced by the CLI any more — which is the point of the fix. The
 * damaged body is written to disk directly, exactly as the four cards in this
 * repository carried it before `doctor --fix` existed.
 */
test("doctor reports and repairs a trail written outside its section", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-trail-"));
    await cp(fixture, root, { recursive: true });
    try {
        const cards = join(root, ".project", "cards");
        const named = async () => {
            const found = (await readdir(cards)).find((name) =>
                name.startsWith("T-0001")
            );
            assert.ok(found, "the fixture lost its card");
            return join(cards, found);
        };
        const file = await named();
        const original = await readFile(file, "utf8");
        // Written with the file's own line ending: the fixture arrives CRLF on
        // Windows, and a hard-coded `\n---\n` matched nothing there, so the
        // test injected no damage and then asserted the damage was reported.
        const eol = original.includes("\r\n") ? "\r\n" : "\n";
        await writeFile(
            file,
            original.replace(
                /\r?\n---\r?\n/,
                [
                    "",
                    "---",
                    "",
                    "The trail lives in `## Activity`.",
                    "- 2026-08-02 16:56Z alice · claimed",
                    "- 2026-08-02 17:07Z alice · doing → done",
                    ""
                ].join(eol)
            )
        );

        const reported = JSON.parse(
            (await outcome(["doctor", "--root", root, "--json"])).stdout
        ).issues.filter((issue) => issue.code === "misplaced-trail");
        assert.equal(reported.length, 1);
        assert.equal(reported[0].severity, "warning");
        assert.match(reported[0].message, /2 trail entries/);

        const fixed = await outcome(["doctor", "--root", root, "--fix"]);
        assert.match(fixed.stdout, /moved: T-0001 2 trail entries/);

        // Re-resolved: `--fix` also reslugs, and the fixture's filename does
        // not match its title, so the repair lands under a new name.
        const repaired = await readFile(await named(), "utf8");
        assert.match(
            repaired,
            /## Activity\r?\n\r?\n- 2026-08-02 16:56Z alice · claimed/
        );
        assert.match(repaired, /^The trail lives in `## Activity`\.\r?$/m);
        // The repair rewrites the whole body, so it is also where a file would
        // acquire a second kind of line ending if the writers disagreed.
        assert.equal(
            /\r\n/.test(repaired) && /[^\r]\n/.test(repaired),
            false,
            "the repaired card has mixed line endings"
        );
        assert.deepEqual(
            JSON.parse(
                (await outcome(["doctor", "--root", root, "--json"])).stdout
            ).issues.filter((issue) => issue.code === "misplaced-trail"),
            []
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
