import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
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
test("every flag the CLI reads is a flag the CLI accepts", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
        new URL("../bin/workfile.ts", import.meta.url),
        "utf8"
    );

    const listed = new Set();
    const globals = source.slice(
        source.indexOf("const GLOBAL_FLAGS"),
        source.indexOf("];", source.indexOf("const GLOBAL_FLAGS"))
    );
    const commands = source.slice(
        source.indexOf("const COMMAND_FLAGS"),
        source.indexOf("\n};", source.indexOf("const COMMAND_FLAGS"))
    );
    for (const block of [globals, commands]) {
        for (const match of block.matchAll(/"(--?[\w-]+)"/g)) listed.add(match[1]);
    }

    const read = new Set(
        [...source.matchAll(/\b(?:option|listOption|has)\("(--[\w-]+)"\)/g)].map(
            (match) => match[1]
        )
    );

    const missing = [...read].filter((flag) => !listed.has(flag)).sort();
    assert.deepEqual(
        missing,
        [],
        `read by the CLI but rejected by assertKnownFlags: ${missing.join(", ")}`
    );
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

    const declared = new Set(
        [
            ...source
                .slice(source.indexOf("const DRY_RUN_COMMANDS"))
                .slice(0, 200)
                .matchAll(/"([\w-]+)"/g)
        ].map((match) => match[1])
    );
    assert.ok(declared.size >= 4, "expected the supported commands to be listed");

    // Each one really does read the flag; a stale entry would re-open the hole.
    for (const command of declared) {
        const handler = source.indexOf(`async function ${command}Command`);
        const region =
            handler === -1
                ? source
                : source.slice(handler, handler + 12000);
        assert.match(
            region,
            /has\("--dry-run"\)|dryRun:/,
            `${command} is listed as supporting --dry-run but never reads it`
        );
    }

    assert.match(source, /assertDryRunSupported\(command\);/);
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
    const { card } = await import("./support/workspace.mjs");
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
