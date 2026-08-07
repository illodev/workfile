import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * An anchored quantifier applied to something a caller supplies.
 *
 * CodeQL reported `js/polynomial-redos` as high against `routeRoots`:
 * `replace(/\/+$/, "")` retries the anchored `+` from every start position, so a
 * value of N separators costs O(N²). It reported exactly one of the six copies of
 * that spelling, because it was the one whose taint it could follow from a
 * declared value — so fixing what was reported would have left five, and the next
 * report waiting on whichever grew an input first (T-0224).
 *
 * This refuses the shape by name instead. It is not taint analysis and does not
 * pretend to be: what it does is make the seventh copy a decision somebody writes
 * down here rather than an accident, and name the linear alternative.
 */

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * The shape: a `replace` whose pattern ends in `+$/` or `*$/`.
 *
 * Anchored at the end is what makes it quadratic — the engine cannot fail fast,
 * because a match may still start further along. An unanchored `+` is linear and
 * is not what this is about.
 */
const ANCHORED_QUANTIFIER_SOURCE = "replace\\(\\s*/[^/\\n]*[+*]\\$/";

/** A fresh matcher per use: a `g` regex carries `lastIndex` between calls, and
 *  sharing one across files made the staleness check below skip whichever file
 *  came after a match. */
const anchoredQuantifier = (flags = "") =>
    new RegExp(ANCHORED_QUANTIFIER_SOURCE, flags);

/**
 * Where the shape survives, and why each one is allowed to.
 *
 * Every entry is a bounded input, and the bound is the argument — not "it looks
 * fine". The five slug helpers run on a title, and a title is refused past 80
 * characters on write (`CARD_TITLE_TOO_LONG`), so the quadratic is over 80
 * characters at worst. Take the cap away and these become the next finding.
 */
const ALLOWED = new Map([
    ["src/modules/cards/slug.ts", "a card title, capped at 80 characters on write"],
    ["src/modules/memory/memory.ts", "a memory record title, same cap"],
    ["src/modules/docs/docs.ts", "a document title, same cap"],
    ["src/modules/changelog/changelog.ts", "a fragment title or a version string"],
    ["src/modules/init/initializer.ts", "a project name, supplied once at init"]
]);

async function sourcesUnder(directory: string, found: string[] = []) {
    for (const entry of await readdir(join(packageRoot, directory), {
        withFileTypes: true
    })) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) await sourcesUnder(path, found);
        else if (/\.(ts|mjs)$/.test(entry.name)) found.push(path);
    }
    return found;
}

test("no new anchored quantifier is applied to a value a caller supplies", async () => {
    const files = [
        ...(await sourcesUnder("src")),
        ...(await sourcesUnder("bin"))
    ];
    assert.ok(files.length > 40, `scanned only ${files.length} files; the walk broke`);

    const found: string[] = [];
    for (const file of files) {
        const source = (await readFile(join(packageRoot, file), "utf8")).replaceAll(
            "\r\n",
            "\n"
        );
        const lines = source.split("\n");
        for (const match of source.matchAll(anchoredQuantifier("g"))) {
            if (ALLOWED.has(file)) continue;
            const number = source.slice(0, match.index).split("\n").length;
            // A comment explaining the shape is not the shape. This caught its
            // own documentation on the first run — the paragraph in
            // `frontmatter.ts` that says why the loop is there quotes the regex
            // it replaced — and a rule that reports prose teaches people to
            // stop reading it.
            const text = lines[number - 1].trimStart();
            if (text.startsWith("*") || text.startsWith("//") || text.startsWith("/*")) {
                continue;
            }
            found.push(`${file}:${number}  ${match[0]}`);
        }
    }
    assert.deepEqual(
        found,
        [],
        "These retry an anchored quantifier from every start position, which is " +
            "O(N²) in the length of the value. Strip with a loop instead — " +
            "`stripTrailingSlashes` in `core/glob.ts` is the one for separators — " +
            "or add the file to ALLOWED with the bound that makes it safe:\n  " +
            found.join("\n  ")
    );

    // And the allowlist is not a place things rot: an entry naming a file that no
    // longer has the shape is an entry that stopped meaning anything.
    for (const [file, reason] of ALLOWED) {
        const source = await readFile(join(packageRoot, file), "utf8");
        assert.match(
            source,
            anchoredQuantifier(),
            `${file} is allowed for "${reason}" and no longer has the shape; drop the entry`
        );
    }
});
