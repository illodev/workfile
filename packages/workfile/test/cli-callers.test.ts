import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every flag anything *sends* to the CLI, against the table of what it reads.
 *
 * T-0182. `cli.test.ts` already pins the flag table against the flags each
 * subcommand reads, in both directions, and it caught a stale `card archive
 * --actor` in the branch that removed `init --language`. What it cannot see is
 * the other side of the call: the flags a *caller* sends. So that branch stayed
 * green locally through fourteen commits and failed in CI at the first command
 * the package smoke test runs — `smoke:package` belongs to `check:release`, and
 * `pnpm run check`, which is the command the protocol tells an agent to run
 * before finishing, does not run it.
 *
 * The gap is not that a test was missing. It is that the sources which teach or
 * send a flag are not executed by `pnpm run test`:
 *
 * - the generated agent instructions and the docs, which are text: a removed
 *   flag still taught by `AGENTS.md` or `SKILL.md` is a command an agent will
 *   confidently run and the repository will refuse;
 * - `test/package-smoke.ts`, which only `check:release` runs;
 * - `scripts/`, which nothing runs on a pull request.
 *
 * The unit tests are deliberately *not* scanned. A test that passes a removed
 * flag already fails when the suite runs, which is a better signal than a text
 * match — and those files contain flags that are meant not to exist
 * (`--bogus`, `--nonsense`, `--statuss`), because asserting the refusal path is
 * their job. Scanning them would mean teaching this an allowlist of deliberate
 * nonsense, and then a real stale flag could hide in it.
 *
 * ## What this still does not cover
 *
 * Flag *values*: `--status doingg` and `--area nonexistent` pass here. Only the
 * flag names are compared, because the table is the only machine-readable
 * contract — the legal values live in the config and in the schema.
 *
 * Invocations assembled at runtime. `["card", action, ...flags]` reaches the CLI
 * as a real call and appears here as nothing at all, because there is no literal
 * to read. The coverage floor below is the guard against that going unnoticed
 * wholesale; it cannot see one call becoming dynamic.
 *
 * Subcommand words, except by accident. An invocation whose command word
 * resolves to no table row is reported, which is how `workfile docs create`
 * would surface if `docs` ever stopped aliasing `doc` — but a word that resolves
 * to the wrong row still checks its flags against that row.
 *
 * Anything outside the roots listed in `SOURCES`. A new directory of generated
 * instructions is not covered until it is named here.
 *
 * And the whole of the other route the card weighed, which is the largest gap:
 * this reads text, so it proves nothing about the artifact that ships. Whether
 * the tarball carries the bin, whether the shebang survives, whether a consumer
 * can resolve the package at all — none of that is here, and `pnpm run check`
 * still does not answer it. That is `smoke:package` under `check:release`, and
 * folding it into `check` costs about thirty seconds on every local run, which is
 * a trade worth making deliberately rather than as a side effect of this. T-0220.
 */

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(packageRoot, "../..");

/** Text that teaches a command, and code that sends one. */
const SOURCES = {
    text: [
        ".project/agents",
        ".claude/commands",
        ".claude/skills",
        "plugins/workfile/commands",
        "packages/workfile/docs",
        "README.md"
    ],
    code: ["packages/workfile/test/package-smoke.ts", "scripts", "packages/workfile/scripts"]
};

/**
 * The lowest number of invocations this may find and still be believed.
 *
 * A checker that reads text is one refactor away from matching nothing and
 * passing forever. The floor is well under the current count so ordinary edits
 * do not trip it, and far above zero so a broken extractor fails loudly.
 */
const COVERAGE_FLOOR = 90;

async function filesUnder(root: string, extension: string) {
    const absolute = join(repoRoot, root);
    const stack = [absolute];
    const found: string[] = [];
    while (stack.length) {
        const directory = stack.pop() as string;
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch {
            // A single file was named rather than a directory.
            if (absolute.endsWith(extension)) return [absolute];
            return [];
        }
        for (const entry of entries) {
            if (entry.name === "node_modules" || entry.name === "dist") continue;
            const path = join(directory, entry.name);
            if (entry.isDirectory()) stack.push(path);
            else if (path.endsWith(extension)) found.push(path);
        }
    }
    return found.sort();
}

/** `{...}` object literals in the CLI source, read as `key: "value"` pairs. */
function pairsOf(source: string, name: string) {
    const start = source.indexOf(`const ${name}`);
    const text = source.slice(start, source.indexOf("\n};", start));
    return Object.fromEntries(
        [...text.matchAll(/(\w+):\s*"(\w+)"/g)].map((match) => [match[1], match[2]])
    );
}

test("every flag a caller sends is a flag the CLI reads", async () => {
    const source = await readFile(join(packageRoot, "bin/workfile.ts"), "utf8");

    // Read from the source rather than restated here, so a new row, alias or
    // bare-command default cannot leave this checking against a stale copy.
    const tableStart = source.indexOf("const COMMAND_FLAGS");
    const table = source.slice(tableStart, source.indexOf("\n};", tableStart));
    const globalStart = source.indexOf("const GLOBAL_FLAGS");
    const globals = new Set(
        [
            ...source
                .slice(globalStart, source.indexOf("];", globalStart))
                .matchAll(/"(--?[\w-]+)"/g)
        ].map((match) => match[1])
    );
    const declared: Record<string, Set<string>> = {};
    for (const entry of table.matchAll(/"([\w ]+)": \[([^\]]*)\]/g)) {
        declared[entry[1]] = new Set(
            [...entry[2].matchAll(/"(--?[\w-]+)"/g)].map((match) => match[1])
        );
    }
    assert.ok(
        Object.keys(declared).length >= 40,
        "the flag table was not parsed; the slice above has drifted from the source"
    );

    const aliases = pairsOf(source, "USAGE_ALIASES");
    const defaults = pairsOf(source, "DEFAULT_SUBCOMMAND");
    const words = new Set([
        ...Object.keys(declared).map((key) => key.split(" ")[0]),
        ...Object.keys(aliases)
    ]);

    // `commandKey` in the CLI, over literals instead of over argv. A word with
    // no row is not silently accepted: it comes back null and is reported.
    const keyFor = (spoken: string[]) => {
        if (!spoken.length) return null;
        const word = aliases[spoken[0]] || spoken[0];
        if (spoken[1] && declared[`${word} ${spoken[1]}`]) {
            return `${word} ${spoken[1]}`;
        }
        const fallback = defaults[word];
        if (fallback && declared[`${word} ${fallback}`]) return `${word} ${fallback}`;
        return declared[word] ? word : null;
    };

    const calls: Array<{ key: string; flags: string[]; where: string }> = [];
    const unattributed: string[] = [];

    const record = (
        spoken: string[],
        flags: string[],
        where: string
    ) => {
        if (!flags.length) return;
        // `workfile card --help` names no subcommand and needs none: a global
        // flag is accepted by all of them.
        if (flags.every((flag) => globals.has(flag))) return;
        const key = keyFor(spoken);
        if (!key) {
            unattributed.push(`${where} ${spoken.join(" ") || "(no command word)"} ${flags.join(" ")}`);
            return;
        }
        calls.push({ key, flags, where });
    };

    // Prose: `workfile <words> --flags`, one invocation per line. Stops at a
    // backtick or a pipe so a sentence that quotes a flag after the command does
    // not get read as part of it.
    for (const root of SOURCES.text) {
        for (const file of await filesUnder(root, ".md")) {
            const body = await readFile(file, "utf8");
            body.split("\n").forEach((line, index) => {
                for (const match of line.matchAll(/\bworkfile\s+([^\n`|]*)/g)) {
                    const rest = match[1];
                    const spoken: string[] = [];
                    for (const token of rest.trim().split(/\s+/).filter(Boolean)) {
                        if (!/^[a-z][a-z-]*$/.test(token)) break;
                        spoken.push(token);
                    }
                    record(
                        spoken,
                        [...rest.matchAll(/(?:^|\s)(--[a-z][\w-]*)/g)].map(
                            (flag) => flag[1]
                        ),
                        `${relative(repoRoot, file)}:${index + 1}`
                    );
                }
            });
        }
    }

    // Code: argv arrays whose first literal is a command word. That test is what
    // separates `run(project, ["card", "create", ...])` from `run(npm, ["pack",
    // "--pack-destination", ...])` without having to know which binary each
    // variable holds.
    for (const root of SOURCES.code) {
        for (const file of await filesUnder(root, ".ts")) {
            const body = await readFile(file, "utf8");
            for (const match of body.matchAll(/\[([^[\]]*)\]/g)) {
                const literals = [...match[1].matchAll(/"([^"\n]*)"/g)].map(
                    (literal) => literal[1]
                );
                if (!literals.length || !words.has(literals[0])) continue;
                const spoken: string[] = [];
                for (const literal of literals) {
                    if (!/^[a-z][a-z-]*$/.test(literal)) break;
                    spoken.push(literal);
                }
                record(
                    spoken,
                    literals.filter((literal) => /^--[a-z][\w-]*$/.test(literal)),
                    `${relative(repoRoot, file)}:${
                        body.slice(0, match.index).split("\n").length
                    }`
                );
            }
        }
    }

    assert.ok(
        calls.length >= COVERAGE_FLOOR,
        `only ${calls.length} invocations found, expected at least ${COVERAGE_FLOOR}. ` +
            "The extractor stopped matching rather than the callers stopping sending flags."
    );

    assert.deepEqual(
        unattributed.sort(),
        [],
        "sent to a command word with no row in the flag table:\n  " +
            unattributed.join("\n  ")
    );

    const stale = new Set<string>();
    for (const call of calls) {
        for (const flag of call.flags) {
            if (globals.has(flag) || declared[call.key].has(flag)) continue;
            stale.add(`${call.where}  ${call.key} ${flag}`);
        }
    }
    assert.deepEqual(
        [...stale].sort(),
        [],
        `${stale.size} caller(s) send a flag the CLI does not read. Either the ` +
            "flag was removed and the caller was not updated, or it is missing " +
            "from COMMAND_FLAGS:\n  " +
            [...stale].sort().join("\n  ")
    );
});
