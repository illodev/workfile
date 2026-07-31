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
