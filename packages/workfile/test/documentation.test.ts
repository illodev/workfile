import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

/** Documentation that reaches a reader: published docs plus the READMEs. */
const DOCS: ReadonlyArray<readonly [string, URL]> = [
    ["README.md", repoRoot],
    ["AGENTS.md", repoRoot],
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
 * A bare word that runs something, and the subcommand it runs.
 *
 * `workfile mcp` serves, so `workfile mcp --read-only` is a real invocation and
 * both `docs/cli.md` and `docs/mcp.md` teach it. It is also unvalidated:
 * `assertKnownFlags` keys on `"mcp serve"`, finds no table for the bare `mcp`,
 * and returns — which is why `workfile mcp --nonsense` starts the server
 * instead of refusing. Carded as T-0100. Resolving the default here checks the
 * documentation against what the command *does*, not against the hole.
 */
const DEFAULT_SUBCOMMAND: Record<string, string> = { mcp: "serve" };

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
        const fallback = DEFAULT_SUBCOMMAND[resolved];
        return fallback ? `${resolved} ${fallback}` : resolved;
    };

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
        ["wf", "workfile", "workfile-mcp"],
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

    assert.equal(perCommand.length, 4, "the per-subcommand table lost a row");
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
