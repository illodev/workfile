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
 * `project` was renamed to `workfile`. Only `workfile` and `workfile-mcp` are
 * declared as bins, so every `project <command>` in a doc is a line a reader
 * can copy and cannot run. Prose about "the project card" is not the target,
 * so the check only looks inside code spans and fenced blocks.
 */
test("no doc teaches the removed project binary", async () => {
    const commands =
        "card|doc|docs|changelog|memory|agents|ci|claude|migrate|mcp|search|doctor|init|ui|upgrade|schema|version|index|hook";
    const inCodeSpan = new RegExp(`\`project (?:${commands})\\b`);
    const inFence = new RegExp(`^\\s*project (?:${commands})\\b`, "m");
    for (const [path, text] of await documents()) {
        assert.doesNotMatch(
            text,
            inCodeSpan,
            `${path} names the removed project binary in a code span`
        );
        assert.doesNotMatch(
            text,
            inFence,
            `${path} names the removed project binary in a code block`
        );
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
 *
 * `COMMAND_FLAGS` is the dispatch table, read out of the source the way
 * `cli.test.ts` reads it: the bin executes on import, so it cannot be imported.
 * That table is itself pinned against what each branch reads, by
 * "the flag table matches what each subcommand actually reads".
 */
test("no doc teaches a command path the dispatcher does not know", async () => {
    const source = await readFile(new URL("bin/workfile.ts", packageRoot), "utf8");
    const start = source.indexOf("const COMMAND_FLAGS");
    const table = source.slice(start, source.indexOf("\n};", start));
    const known = new Set(
        [...table.matchAll(/^ {4}"([^"]+)":/gm)].map((match) => match[1])
    );
    // If the table is ever renamed or reindented this slice yields nothing, and
    // every documented command then reads as unknown — sixty false positives
    // that look like a documentation problem. Fail as what it is instead.
    assert.ok(
        known.size > 40,
        `read only ${known.size} commands out of COMMAND_FLAGS; the extraction broke`
    );
    // A bare word is an entry point in its own right; section 19.1 documents
    // the whole list of them, and `workfile mcp` runs.
    for (const key of [...known]) known.add(key.split(" ")[0]);
    for (const [alias, real] of [
        ["docs", "doc"],
        ["history", "changelog"],
        ["serve", "ui"]
    ]) {
        for (const key of [...known]) {
            if (key === real) known.add(alias);
            else if (key.startsWith(`${real} `)) {
                known.add(`${alias} ${key.slice(real.length + 1)}`);
            }
        }
    }
    known.add("help");

    /**
     * Code fragments only, as `[line, text]`. Prose is not an instruction: the
     * README says "loading all workfile memory" and SPEC says "durable
     * workfile memory", and neither is a command anybody can copy.
     */
    const fragments = (text: string) => {
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
        // scanned twice, and a span that wraps a line break is still one
        // command: packages/workfile/README.md writes `workfile agents\nsync`.
        const prose = outside.join("\n");
        for (const match of prose.matchAll(/`([^`]+)`/g)) {
            found.push([
                prose.slice(0, match.index).split("\n").length,
                match[1].replace(/\s*\n\s*/g, " ")
            ]);
        }
        return found;
    };

    // Three bins are declared, and `wf` is one of them — README.md writes
    // `wf doctor`. Scanning only the long name leaves the short one unchecked.
    // A subcommand is a lowercase bare word on the same line: never a flag,
    // never an id like `T-0042`, never a placeholder like `<command>`.
    const invocation =
        /(?:^|[\s(&|;$])(?:(?:npx|pnpm|pnpm dlx)\s+)?(?:workfile|wf)[ \t]+([a-z][a-z-]*)(?:[ \t]+([a-z][a-z-]*))?/g;

    const unknown: string[] = [];
    for (const [path, text] of await documents()) {
        for (const [line, code] of fragments(text)) {
            for (const [, word, next] of code.matchAll(invocation)) {
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
