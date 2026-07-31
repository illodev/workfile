import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    related: ["--related", "T-0001"]
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

// Found while testing the above: a boolean flag left off the no-value list is
// assumed to consume the next token, so it swallowed the flag after it.
// `doctor --fix --bogus` accepted `--bogus` and ran the repair anyway.
test("a boolean flag does not swallow the flag after it", async () => {
    const failed = await outcome(["doctor", "--fix", "--bogus", "--root", fixture]);
    assert.equal(failed.code, 1);
    assert.match(failed.stderr, /CLI_ARGUMENT_UNKNOWN/);
    assert.match(failed.stderr, /--bogus/);
});
