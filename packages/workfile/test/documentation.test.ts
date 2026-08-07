import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { createTestWorkspace } from "./support/workspace.ts";

const execute = promisify(execFile);
const cli = resolve(fileURLToPath(new URL("../dist/bin/workfile.js", import.meta.url)));

/**
 * The shipped documentation must not name things that do not exist.
 *
 * Two separate drifts motivated this file, both found by hand long after the
 * fact. `docs/ui.md` described a shadcn registry that had been deleted, and
 * the CLI's own `--help` taught `project ci sync` after the `project` binary
 * was renamed. Both shipped: `files` publishes `docs`, and the usage block is
 * compiled into `dist`. Documentation is not checked by the type system, so
 * the two mistakes that are mechanically detectable get a test instead.
 */

const repoRoot = new URL("../../../", import.meta.url);
const packageRoot = new URL("../", import.meta.url);

/**
 * Documentation that reaches a reader: published docs plus the READMEs.
 *
 * SECURITY.md was missing from this list until T-0149, and it was the one file
 * with a broken link — its only link, to the threat model, resolved to a path
 * that does not exist. GitHub renders it in the Security tab, so the 404 was on
 * the page whose whole job is telling a reporter what is in scope. It is also
 * outside `docs.sources` in `project.config.mjs`, so the freshness tracking
 * never saw it either. A document nothing reads is where this class of defect
 * accumulates.
 */
const DOCS: ReadonlyArray<readonly [string, URL]> = [
    ["README.md", repoRoot],
    ["AGENTS.md", repoRoot],
    ["SECURITY.md", repoRoot],
    ["packages/workfile/README.md", repoRoot],
    ["packages/search-local/README.md", repoRoot],
    ["docs/cli.md", packageRoot],
    ["docs/getting-started.md", packageRoot],
    ["docs/http-api.md", packageRoot],
    ["docs/mcp.md", packageRoot],
    ["docs/security.md", packageRoot],
    ["docs/SPEC.md", packageRoot],
    ["docs/ui.md", packageRoot]
];

async function documents(): Promise<Array<[string, string]>> {
    const result: Array<[string, string]> = [];
    for (const [path, base] of DOCS) {
        result.push([path, await readFile(new URL(path, base), "utf8")]);
    }
    return result;
}

/** Spellings the dispatcher accepts for a command it stores under one key. */
const ALIASES: ReadonlyArray<readonly [string, string]> = [
    ["docs", "doc"],
    ["history", "changelog"],
    ["serve", "ui"]
];

/**
 * The CLI's two flag tables, read out of the source.
 *
 * The bin executes on import, so it cannot be imported; `cli.test.ts` reads it
 * the same way. `COMMAND_FLAGS` is itself pinned against what each branch
 * actually reads, by "the flag table matches what each subcommand actually
 * reads", so a documentation check measured against it is measured against
 * behaviour rather than against a second list.
 */
async function dispatchTable() {
    const source = await readFile(new URL("bin/workfile.ts", packageRoot), "utf8");
    const slice = (name: string, close: string) => {
        const start = source.indexOf(`const ${name}`);
        return source.slice(start, source.indexOf(close, start));
    };

    const globals = new Set(
        [...slice("GLOBAL_FLAGS", "\n];").matchAll(/"([^"]+)"/g)].map((m) => m[1])
    );
    // `workfile mcp` serves, so `workfile mcp --read-only` is a real
    // invocation that both cli.md and mcp.md teach, and it has to be checked
    // against `mcp serve`. Read from the source rather than declared here: the
    // dispatcher resolves the bare form through this same table, and a second
    // copy would only be right until one of them moved.
    const defaults = Object.fromEntries(
        [...slice("DEFAULT_SUBCOMMAND", "\n};").matchAll(/^ {4}(\w+): "(\w+)"/gm)].map(
            (match) => [match[1], match[2]]
        )
    );
    const table = slice("COMMAND_FLAGS", "\n};");
    const accepts = new Map<string, Set<string>>();
    let current: string | null = null;
    for (const line of table.split("\n")) {
        const key = line.match(/^ {4}"([^"]+)": \[/);
        if (key) {
            current = key[1];
            accepts.set(current, new Set());
            continue;
        }
        const flag = line.match(/^ {8}"([^"]+)"/);
        if (flag && current) accepts.get(current)!.add(flag[1]);
    }
    // If either table is renamed or reindented these slices yield nothing, and
    // every documented command then reads as unknown — sixty false positives
    // that look like a documentation problem. Fail as what it is instead.
    assert.ok(
        accepts.size > 40,
        `read only ${accepts.size} commands out of COMMAND_FLAGS; the extraction broke`
    );
    assert.ok(
        globals.has("--root") && globals.size < 10,
        `read ${globals.size} global flags; the extraction broke`
    );

    const known = new Set(accepts.keys());
    // A bare word is an entry point in its own right; section 19.1 documents
    // the whole list of them, and `workfile mcp` runs.
    for (const key of [...known]) known.add(key.split(" ")[0]);
    for (const [alias, real] of ALIASES) {
        for (const key of [...known]) {
            if (key === real) known.add(alias);
            else if (key.startsWith(`${real} `)) {
                known.add(`${alias} ${key.slice(real.length + 1)}`);
            }
        }
    }
    known.add("help");

    /** A documented spelling reduced to the key the tables are stored under. */
    const canonical = (path: string) => {
        let resolved = path;
        for (const [alias, real] of ALIASES) {
            if (resolved === alias) resolved = real;
            else if (resolved.startsWith(`${alias} `)) {
                resolved = `${real} ${resolved.slice(alias.length + 1)}`;
            }
        }
        const fallback = defaults[resolved];
        return fallback ? `${resolved} ${fallback}` : resolved;
    };
    assert.ok(defaults.mcp, "DEFAULT_SUBCOMMAND no longer resolves the bare mcp");

    return { globals, accepts, known, canonical };
}

/**
 * Code fragments only, as `[line, text]`. Prose is not an instruction: the
 * README says "loading all workfile memory" and SPEC says "durable workfile
 * memory", and neither is a command anybody can copy.
 */
function fragments(text: string): Array<[number, string]> {
    const found: Array<[number, string]> = [];
    const outside: string[] = [];
    let fenced = false;
    text.split("\n").forEach((line, index) => {
        if (/^\s*```/.test(line)) {
            fenced = !fenced;
            outside.push("");
            return;
        }
        if (fenced) {
            found.push([index + 1, line]);
            outside.push("");
        } else outside.push(line);
    });
    // Spans are read from the fence-stripped text so a fenced line is never
    // scanned twice, and a span that wraps a line break is still one command:
    // packages/workfile/README.md writes `workfile agents\nsync`.
    const prose = outside.join("\n");
    for (const match of prose.matchAll(/`([^`]+)`/g)) {
        found.push([
            prose.slice(0, match.index).split("\n").length,
            match[1].replace(/\s*\n\s*/g, " ")
        ]);
    }
    return found;
}

/**
 * Three bins are declared, and `wf` is one of them — README.md writes
 * `wf doctor`. Scanning only the long name leaves the short one unchecked. A
 * subcommand is a lowercase bare word on the same line: never a flag, never an
 * id like `T-0042`, never a placeholder like `<command>`.
 */
const INVOCATION =
    /(?:^|[\s(&|;$])(?:(?:npx|pnpm|pnpm dlx)\s+)?(?:workfile|wf)[ \t]+([a-z][a-z-]*)(?:[ \t]+([a-z][a-z-]*))?/g;

/**
 * A doc naming a test or script file it cannot point at is either stale or a
 * typo, and both read as authoritative. Paths are resolved from the package
 * root and the repository root, because `docs/ui.md` says `test/foo.test.ts`
 * while the root README says `scripts/foo.ts`.
 */
test("every test and script file named in the docs exists", async () => {
    const reference = /(?:^|[\s`("'])((?:test|scripts)\/[\w./-]+\.(?:ts|mjs|js))/g;
    for (const [path, text] of await documents()) {
        for (const match of text.matchAll(reference)) {
            const named = match[1];
            const found = [packageRoot, repoRoot].some((base) =>
                existsSync(new URL(named, base))
            );
            assert.ok(found, `${path} names ${named}, which does not exist`);
        }
    }
});

/**
 * A relative link that resolves to nothing is a 404 with a confident label.
 *
 * SECURITY.md pointed at `docs/security.md`, which reads correctly and does not
 * exist: the file is `packages/workfile/docs/security.md`, and the repository
 * root has no `docs/` at all. It survived because it is the kind of mistake
 * that only shows when somebody clicks — the path is plausible, the link text
 * is right, and every other check in this file reads commands rather than
 * links.
 *
 * Anchors are stripped rather than verified. A missing file is unambiguous; a
 * missing heading depends on how the renderer slugifies, and a check that
 * guesses at that would fail on correct links.
 */
test("every relative link in the docs resolves", async () => {
    const broken: string[] = [];
    let checked = 0;
    for (const [path, base] of DOCS) {
        const document = new URL(path, base);
        const text = await readFile(document, "utf8");
        for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
            const target = match[1];
            if (/^(?:https?:|mailto:|#)/.test(target)) continue;
            const [file] = target.split("#");
            if (!file) continue;
            checked += 1;
            if (existsSync(new URL(file, document))) continue;
            const line = text.slice(0, match.index).split("\n").length;
            broken.push(`${path}:${line} links ${target}, which does not exist`);
        }
    }
    assert.ok(checked > 10, `resolved only ${checked} links; the scan broke`);
    assert.deepEqual(broken, [], `\n${broken.join("\n")}\n`);
});

/**
 * `project` was renamed to `workfile`. Three bins are declared — `workfile`,
 * `wf` and `workfile-mcp` — so every `project <command>` in a doc is a line a
 * reader can copy and cannot run. Prose about "the project card" is not the
 * target, so the check only looks inside code spans and fenced blocks.
 *
 * Naming the binary *alone* was the wider miss, and the worse one. SPEC.md's
 * header read "CLI name: `project`" and its locked Phase 0 decision read "The
 * executable is `project`" — the document stating normatively what the thing is
 * called, naming the wrong thing, under a test written to prevent exactly that.
 * A copyable `project card list` is a broken line; those two were the contract.
 *
 * `project:agents` and `.project/` are a script namespace and the storage root.
 * Both are current, both must keep passing, which is why the bare form is
 * matched as a whole span rather than as a prefix.
 */
test("no doc teaches the removed project binary", async () => {
    const declared = JSON.parse(
        await readFile(new URL("package.json", packageRoot), "utf8")
    ).bin;
    assert.deepEqual(
        Object.keys(declared).sort(),
        ["wf", "workfile", "workfile-hooks", "workfile-mcp"],
        "the declared bins changed; the vocabulary below is no longer closed"
    );

    const commands =
        "card|doc|docs|changelog|memory|agents|ci|claude|migrate|mcp|search|doctor|init|ui|upgrade|schema|version|index|hook";
    const checks: ReadonlyArray<readonly [RegExp, string]> = [
        [new RegExp(`\`project (?:${commands})\\b`), "in a code span"],
        [new RegExp(`^\\s*project (?:${commands})\\b`, "m"), "in a code block"],
        // A span holding nothing but the word is the binary being named, not a
        // path (`.project/`), a script (`project:mcp`) or a file
        // (`project.config.mjs`) — none of which can match a closing backtick
        // straight after the `t`.
        [/`project`/, "as a bare name in a code span"],
        [/^\s*project\s*$/m, "as a bare name in a code block"]
    ];
    for (const [path, text] of await documents()) {
        for (const [pattern, where] of checks) {
            assert.doesNotMatch(
                text,
                pattern,
                `${path} names the removed project binary ${where}`
            );
        }
    }
});

/**
 * A doc must not teach a command the binary rejects.
 *
 * SPEC section 19 is a catalogue of invocations, and five of them did not
 * exist: `card edit`, `docs search`, `docs open`, `docs index`, `memory
 * search`, each answered with `CLI_COMMAND_UNKNOWN`. The test above already
 * opened SPEC.md and read the *binary name*; it never read the command.
 *
 * The signal is command-path resolution, not exit status. Most section 19
 * lines exit non-zero in a fresh workspace because they use illustrative ids
 * or omit a required flag — a syntax example is not a script, and running them
 * would report the whole catalogue as broken.
 */
test("no doc teaches a command path the dispatcher does not know", async () => {
    const { known } = await dispatchTable();
    const unknown: string[] = [];
    for (const [path, text] of await documents()) {
        for (const [line, code] of fragments(text)) {
            for (const [, word, next] of code.matchAll(INVOCATION)) {
                // `workfile search release` is a flat command and its QUERY.
                // Only a word the table gives subcommands takes one.
                const branching = [...known].some((key) => key.startsWith(`${word} `));
                const path2 = next && branching ? `${word} ${next}` : null;
                if (path2 ? known.has(path2) : known.has(word)) continue;
                unknown.push(`${path}:${line} teaches \`workfile ${path2 || word}\``);
            }
        }
    }
    assert.deepEqual(unknown, [], `\n${unknown.join("\n")}\n`);
});

/**
 * The other half of the same question: the path resolves, but does the
 * subcommand take the flags the line hands it?
 *
 * It did not, for seven of them. `docs/cli.md` headed a table **Global
 * options** and listed `--expected-revision`, `--force`, `--read-only` and
 * `--yes` under it; all four are refused today with `CLI_ARGUMENT_UNKNOWN` on
 * anything but the subcommands that read them. The cut that made them
 * per-subcommand did not reach the table that states the contract, and the
 * suite compared no documented flag against `COMMAND_FLAGS`, so the reference
 * and the binary disagreed with nothing between them to notice.
 *
 * The flags are attributed to the nearest invocation on their left, because a
 * fenced line can carry two: `workfile card claim ID | workfile card show ID`.
 */
test("no doc gives a subcommand a flag it does not accept", async () => {
    const { globals, accepts, known, canonical } = await dispatchTable();
    const wrong: string[] = [];
    for (const [path, text] of await documents()) {
        for (const [line, code] of fragments(text)) {
            const hits = [...code.matchAll(INVOCATION)];
            hits.forEach((hit, index) => {
                const [, word, next] = hit;
                const branching = [...known].some((key) => key.startsWith(`${word} `));
                const path2 = next && branching ? `${word} ${next}` : null;
                const command = path2 || word;
                // Unknown paths are the sibling test's finding, not this one's.
                if (!known.has(command)) return;
                const end =
                    index + 1 < hits.length ? hits[index + 1].index : code.length;
                const taken = accepts.get(canonical(command)) ?? new Set<string>();
                for (const [, flag] of code
                    .slice(hit.index, end)
                    .matchAll(/(?:^|[\s(\[|])(--[a-z][a-z-]*)/g)) {
                    if (globals.has(flag) || taken.has(flag)) continue;
                    wrong.push(
                        `${path}:${line} gives \`workfile ${command}\` ${flag}, ` +
                            "which it refuses with CLI_ARGUMENT_UNKNOWN"
                    );
                }
            });
        }
    }
    assert.deepEqual(wrong, [], `\n${wrong.join("\n")}\n`);
});

/**
 * The other direction, which nothing checked: a flag that exists and that the
 * help never names.
 *
 * Every test above asks whether what the documentation teaches is real. None
 * asked whether what is real is taught, and the gap was not small — `doc
 * create` accepts ten flags and its usage line named four, `memory add`
 * accepts eighteen and named two. Among the missing were `--body` and
 * `--json-input` on all three record creators, which are the only way to write
 * a record's body in the call that creates it. `card create` named
 * `--json-input`; the other three did not, so the help read as a statement
 * about those commands rather than about itself.
 *
 * That is not a cosmetic gap. Reading it, the reasonable move is to create the
 * record empty and then open the file — which under Claude Code is an `Edit`
 * inside `.project/`, and the protocol hook stops to ask about every one of
 * them. An unwritten line in the help came out the other end as a permission
 * dialog per document, with nothing connecting the two.
 *
 * `--help` rather than `cli.md` on purpose: the help ships compiled into
 * `dist` and is what someone at a terminal actually reads, and an agent has no
 * browser open.
 */
test("--help names every flag its subcommands accept", async () => {
    const { accepts } = await dispatchTable();
    const words = [...new Set([...accepts.keys()].map((key) => key.split(" ")[0]))];
    const missing: string[] = [];
    for (const word of words) {
        const { stdout } = await execute(process.execPath, [cli, word, "--help"], {
            encoding: "utf8",
            maxBuffer: 1024 * 1024
        });
        for (const [key, flags] of accepts) {
            if (key !== word && !key.startsWith(`${word} `)) continue;
            for (const flag of flags) {
                // Word-bounded: `--to` must not be satisfied by `--tags`.
                if (new RegExp(`${flag}(?![\\w-])`).test(stdout)) continue;
                missing.push(`workfile ${word} --help never names ${flag} (${key})`);
            }
        }
    }
    assert.deepEqual(missing, [], `\n${missing.join("\n")}\n`);
});

/**
 * `cli.md` opens by naming the flags that work everywhere, and a reader takes
 * that list as the contract. Enumerating it correctly is not something the
 * check above can see: a flag wrongly called global is only caught when some
 * other line hands it to a subcommand that refuses it, and four of these had
 * no such line.
 *
 * The second table is pinned the same way and for the same reason — it exists
 * to say where the four that moved actually live, and a list of subcommands is
 * exactly the kind of thing that rots silently.
 */
test("cli.md's option tables state the contract the binary enforces", async () => {
    const { globals, accepts } = await dispatchTable();
    const text = await readFile(new URL("docs/cli.md", packageRoot), "utf8");
    const section = text.slice(
        text.indexOf("## Global options"),
        text.indexOf("Exit codes:")
    );
    assert.ok(section.length > 500, "the Global options section moved or shrank");

    // Two tables in one section, separated by their own `| --- |` rules.
    const tables: Array<Array<[string, string]>> = [];
    for (const line of section.split("\n")) {
        if (/^\|\s*-{3}/.test(line)) tables.push([]);
        else if (line.startsWith("| `") && tables.length) {
            const [, option, applies] = line.split("|").map((cell) => cell.trim());
            tables[tables.length - 1].push([option, applies]);
        }
    }
    assert.equal(tables.length, 2, "cli.md no longer has both option tables");
    const [universal, perCommand] = tables;
    const named = (cell: string) =>
        [...cell.matchAll(/(?:^|[^\w-])(--[a-z-]+|-h)(?![\w-])/g)].map((m) => m[1]);

    assert.deepEqual(
        universal.flatMap(([option]) => named(option)).sort(),
        [...globals].sort(),
        "the global table and GLOBAL_FLAGS disagree about what is global"
    );

    assert.equal(perCommand.length, 5, "the per-subcommand table lost a row");
    for (const [option, applies] of perCommand) {
        const [flag] = named(option);
        assert.ok(
            flag && !globals.has(flag),
            `cli.md lists ${flag} as per-subcommand, but it is global`
        );
        const documented = [...applies.matchAll(/`([a-z]+(?: [a-z]+)?)`/g)]
            .map((match) => match[1])
            .sort();
        const actual = [...accepts.keys()]
            .filter((key) => accepts.get(key)!.has(flag))
            .sort();
        assert.deepEqual(
            documented,
            actual,
            `cli.md and COMMAND_FLAGS disagree about which subcommands take ${flag}`
        );
    }
});

/**
 * The reference must name every subcommand the binary accepts.
 *
 * Every check above runs in one direction: a doc must not teach something that
 * does not exist. Nothing asked the opposite question, and the opposite
 * question had answers — `docs/cli.md` documented neither `workfile version`
 * nor the whole `claude` family, the command that writes the Claude Code
 * surface into a repository. Six subcommand aliases resolved in the dispatcher
 * and appeared in no document at all: `agents status`, `ci status`,
 * `changelog create`, `memory create`, `claude sync`, `mcp stdio`.
 *
 * An undocumented alias is worse than a missing one. It works, so somebody
 * uses it; it is in no reference, so nobody can be told it is supported; and
 * the only way to learn it is to read the dispatcher. `cli.md` now carries an
 * "Accepted spellings" table and this check keeps it whole.
 *
 * Deliberately no allowlist. An exception list is how the forward checks would
 * have rotted too — the first hard case gets added to it and the second
 * follows.
 */
test("cli.md names every subcommand the dispatcher accepts", async () => {
    const { accepts } = await dispatchTable();
    const text = await readFile(new URL("docs/cli.md", packageRoot), "utf8");
    const missing = [...accepts.keys()].filter((key) => !text.includes(key)).sort();
    assert.deepEqual(
        missing,
        [],
        `\ndocs/cli.md never names: ${missing.join(", ")}\n`
    );
});

/**
 * Every configuration key must be documented somewhere a reader can find it.
 *
 * Three were not, in any document, either README or the example config:
 * `cards.activityTrail`, `changelog.releasePrefix` and `mcp.maxMessageBytes`.
 * A key nobody documents is a key nobody sets — it has a default, the default
 * is usually right, and the one project that needs it different has no way to
 * learn it exists short of reading `defaults.ts`.
 *
 * Membership only, deliberately. Checking that a description is *accurate* is
 * not something a test can do, and a check that pretended to would be worse
 * than none. What this catches is the whole class that actually happened:
 * a key added to the schema and to nothing else.
 */
test("every configuration key is named in the documentation", async () => {
    const { DEFAULT_CONFIG } = await import("../dist/src/index.js");
    const leaves = (value, prefix = "") =>
        Object.entries(value).flatMap(([key, nested]) =>
            nested && typeof nested === "object" && !Array.isArray(nested)
                ? leaves(nested, `${prefix}${key}.`)
                : [`${prefix}${key}`]
        );
    const keys = leaves(DEFAULT_CONFIG);
    assert.ok(keys.length > 40, `read ${keys.length} config keys; the walk broke`);

    const corpus = [
        ...(await documents()).map(([, text]) => text),
        await readFile(new URL("project.config.example.mjs", packageRoot), "utf8")
    ].join("\n");

    // The leaf, not the dotted path: docs name `releasePrefix` in prose and
    // `changelog.releasePrefix` in a table, and both are the key documented.
    const orphans = keys
        .filter((key) => !new RegExp(`\\b${key.split(".").pop()}\\b`).test(corpus))
        .sort();
    assert.deepEqual(orphans, [], `\nundocumented config keys: ${orphans.join(", ")}\n`);
});

/**
 * The same rename, on the surfaces that are compiled and shipped rather than
 * read: the usage block printed by `--help` and the diagnostics that tell a
 * user what to run next.
 */
test("no shipped source teaches the removed project binary", async () => {
    for (const path of [
        "bin/workfile.ts",
        "src/modules/health/doctor.ts",
        "src/modules/claude/surface.ts",
        "src/runtime/claude/hooks.mjs"
    ]) {
        const source = await readFile(new URL(path, packageRoot), "utf8");
        assert.doesNotMatch(
            source,
            /`project (?:card|doc|changelog|memory|agents|ci|claude|migrate|mcp|search|doctor|init|ui|upgrade)\b|"project (?:ci|claude|migrate) /,
            `${path} still spells a command with the removed project binary`
        );
    }
});

/**
 * The invocation a client runs is stated in four places, and only one of them
 * is generated.
 *
 * `server.json` publishes it to the MCP Registry, `claudeMcpFile` generates
 * the `.mcp.json` that ships to consumers and to the plugin, and both READMEs
 * quote it for a reader arriving from a registry — mcpservers.org and Glama
 * render the repository README rather than the submitted copy, so what it says
 * is the listing.
 *
 * Three hand-written copies of a string T-0116 already proved is easy to
 * get wrong: the plugin once shipped `workfile-mcp`, a bin npx cannot select
 * from a package spec, and the server answered every request with the CLI help
 * on stdout. Nobody noticed because nothing compared the copies.
 */
test("every stated MCP invocation agrees with the generated one", async () => {
    const { claudeMcpFile } = await import("../dist/src/index.js");
    const generated = claudeMcpFile();
    const args = generated.mcpServers["workfile"].args;

    // `docs/mcp.md` is the fourth copy. It stated the registration in prose —
    // "Registers `workfile-mcp`" — which stayed wrong from 0.4.0, when T-0116
    // moved the invocation to `npx -y @illodev/workfile mcp`, until T-0153. A
    // sentence is not something this check can read, so mcp.md now states the
    // configuration as a block like the others and joins the comparison
    // instead of being pinned by a second, weaker rule.
    for (const [path, base] of [
        ["README.md", repoRoot],
        ["packages/workfile/README.md", repoRoot],
        ["docs/mcp.md", packageRoot]
    ] as ReadonlyArray<readonly [string, URL]>) {
        // Normalized because Windows checks these out with CRLF, and a fence
        // matched on a bare \n finds nothing there. The first version of this
        // test passed everywhere but the Windows runner, which is where the
        // repository's line endings stop being the ones it was written with.
        const content = (await readFile(new URL(path, base), "utf8")).replaceAll(
            "\r\n",
            "\n"
        );
        const block = content.match(
            /```json\n(\{[^`]*?"mcpServers"[^`]*?)\n```/
        );
        assert.ok(block, `${path} states no MCP client configuration`);
        assert.deepEqual(
            JSON.parse(block[1]),
            // The README omits `env`, which is empty and would be noise in a
            // snippet someone copies; everything a client acts on must match.
            {
                mcpServers: {
                    workfile: {
                        command: generated.mcpServers["workfile"].command,
                        args
                    }
                }
            },
            `${path} and claudeMcpFile disagree about how to start the server`
        );
    }

    const server = JSON.parse(
        await readFile(new URL("server.json", repoRoot), "utf8")
    );
    const npm = server.packages.find((one) => one.registryType === "npm");
    assert.ok(npm, "server.json publishes no npm package");
    assert.equal(npm.runtimeHint, generated.mcpServers["workfile"].command);
    assert.equal(
        args.includes(npm.identifier),
        true,
        `server.json publishes ${npm.identifier}, the generated args do not name it`
    );
    // The subcommand the registry tells a client to pass, against the one the
    // generated args actually pass.
    const positional = npm.packageArguments.find(
        (one) => one.type === "positional"
    );
    assert.ok(positional, "server.json declares no positional argument");
    assert.equal(args[args.length - 1], positional.value);
});

/**
 * The names the package publishes, read out of what it publishes.
 *
 * Values come from importing the built module, types from parsing its
 * declaration file — a `.d.ts` erases at runtime, so `ProjectConfig` is
 * unreachable through `import()` and a check that only imported would call
 * every documented type a phantom.
 *
 * Keyed by the subpath a doc writes, because the exports map is the contract:
 * README.md imports `createSemanticSearchProvider` from
 * `@illodev/workfile/search`, and resolving that against the root's exports
 * would pass for the wrong reason.
 */
async function publishedNames(subpath: string) {
    const { exports: map } = JSON.parse(
        await readFile(new URL("package.json", packageRoot), "utf8")
    );
    const entry = map[subpath];
    if (!entry) return null;

    const values = new Set(
        Object.keys(await import(new URL(entry.import, packageRoot).href))
    );
    const declaration = await readFile(new URL(entry.types, packageRoot), "utf8");
    const types = new Set<string>();
    // `export type { A, B as C } from "./types.js"` re-exports, plus anything
    // the file declares itself.
    for (const block of declaration.matchAll(/export type \{([^}]*)\}/g)) {
        for (const specifier of block[1].split(",")) {
            const name = specifier.trim().split(/\s+as\s+/).pop();
            if (name) types.add(name);
        }
    }
    for (const declared of declaration.matchAll(/export (?:interface|type) (\w+)/g)) {
        types.add(declared[1]);
    }
    return { values, types };
}

/**
 * A doc must not name an MCP tool the server does not expose.
 *
 * SPEC section 23 catalogued fourteen "recommended tools" in a verb-first
 * naming scheme — `project_list_cards`, `project_run_doctor` — and thirteen of
 * them never existed. The server shipped noun-first (`project_card_list`) and
 * grew to thirty tools; the section was never reconciled, so the normative
 * document named none of the tools a client can actually call.
 *
 * The sibling checks above already open SPEC.md five times and never saw it:
 * `INVOCATION` matches `workfile <word>`, and a tool name is not an
 * invocation. `docs/mcp.md` names all thirty and is the document that was
 * right, which is why this is measured against `listMcpTools` rather than
 * against mcp.md.
 */
test("no doc names an MCP tool the server does not expose", async () => {
    const { listMcpTools } = await import("../dist/src/index.js");
    const exposed = new Set(listMcpTools().map((tool) => tool.name));
    // A failed import or a renamed export would empty the set and report every
    // documented tool as a phantom. Fail as what it is instead.
    assert.ok(
        exposed.size > 20 && exposed.has("project_search"),
        `read ${exposed.size} tools from listMcpTools; the extraction broke`
    );

    const unknown: string[] = [];
    for (const [path, text] of await documents()) {
        text.split("\n").forEach((line, index) => {
            for (const [name] of line.matchAll(/\bproject_[a-z_]+/g)) {
                if (exposed.has(name)) continue;
                unknown.push(`${path}:${index + 1} names \`${name}\``);
            }
        });
    }
    assert.deepEqual(unknown, [], `\n${unknown.join("\n")}\n`);
});

/**
 * A doc must not import a name the package does not export.
 *
 * SPEC section 16.2 stated the programmatic API as two copyable blocks, and
 * six of the names in them do not exist: `createProject`, `migrateProject` and
 * `buildIndex` are really `initializeProject`, `applyLegacyMigration` and
 * `buildProjectIndex`, while the types `Card`, `ManagedDocument` and
 * `ChangeFragment` are `CardRecord`, `DocumentRecord` and `ChangeRecord`.
 *
 * `test/types/public-api.ts` typechecks the API that exists. Nothing read the
 * API a reader is told exists, and the two had disagreed since 0.1.0.
 *
 * Deliberately name resolution rather than compilation: fenced blocks are
 * fragments, most would not typecheck on their own, and a harness reporting
 * forty false positives is a harness somebody deletes.
 */
test("no doc imports a name the package does not export", async () => {
    const specifiers =
        /(?:import|export)\s+(type\s+)?\{([^}]*)\}\s+from\s+"(@illodev\/workfile(?:\/[a-z-]+)?)"/g;
    const wrong: string[] = [];
    let checked = 0;

    for (const [path, text] of await documents()) {
        for (const statement of text.matchAll(specifiers)) {
            const [, typeOnly, block, module] = statement;
            const subpath = module.replace("@illodev/workfile", ".") as string;
            const published = await publishedNames(subpath === "." ? "." : subpath);
            if (!published) {
                wrong.push(`${path} imports from \`${module}\`, an unpublished subpath`);
                continue;
            }
            const line = text.slice(0, statement.index).split("\n").length;
            for (const raw of block.split(",")) {
                const specifier = raw.trim();
                if (!specifier) continue;
                const name = specifier.replace(/^type\s+/, "").split(/\s+as\s+/)[0];
                const isType = Boolean(typeOnly) || /^type\s/.test(specifier);
                checked += 1;
                if (isType ? published.types.has(name) : published.values.has(name)) {
                    continue;
                }
                wrong.push(
                    `${path}:${line} imports ${isType ? "type " : ""}\`${name}\` ` +
                        `from \`${module}\`, which does not export it`
                );
            }
        }
    }
    // Every documented block sits inside a fence; if the pattern stops matching
    // them the test passes on an empty set and means nothing.
    assert.ok(checked > 10, `resolved only ${checked} specifiers; the scan broke`);
    assert.deepEqual(wrong, [], `\n${wrong.join("\n")}\n`);
});

/**
 * A doc must not hang a module repository off the workspace.
 *
 * The second half of section 16.2 taught `workspace.cards.list(query)`,
 * `workspace.docs.search(query)`, `workspace.memory.create(kind, input)` and
 * `workspace.changelog.createFragment(input)` — nine lines describing an
 * object shape that has never existed. `ProjectWorkspace` carries
 * configuration and paths; the real API is free functions taking a workspace,
 * `loadCards(workspace)` and `createCard(workspace, input)`.
 *
 * Measured against a real loaded workspace rather than against `types.ts`,
 * because the question a reader is asking is what the object has on it.
 */
test("no doc hangs a module repository off the workspace", async () => {
    const { workspace, cleanup } = await createTestWorkspace();
    try {
        const present = new Set(Object.keys(workspace));
        assert.ok(
            present.has("config") && present.has("paths"),
            "the loaded workspace lost its known keys; the check is measuring nothing"
        );
        const wrong: string[] = [];
        for (const [path, text] of await documents()) {
            text.split("\n").forEach((line, index) => {
                for (const [, module, method] of line.matchAll(
                    /\bworkspace\.([a-z]\w*)\.(\w+)\(/g
                )) {
                    if (present.has(module)) continue;
                    wrong.push(
                        `${path}:${index + 1} calls \`workspace.${module}.${method}()\`, ` +
                            "and the workspace has no such member"
                    );
                }
            });
        }
        assert.deepEqual(wrong, [], `\n${wrong.join("\n")}\n`);
    } finally {
        await cleanup();
    }
});
