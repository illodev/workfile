import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const stylesheet = await readFile(
    fileURLToPath(new URL("../ui/src/styles.css", import.meta.url)),
    "utf8"
);

/**
 * The brace-walked body of the block whose selector opens a line.
 *
 * The previous parser substring-matched the text BEFORE a `{`, and the
 * `@custom-variant dark (&:is([data-theme="dark"] *));` line put the string
 * `[data-theme="dark"]` in front of the first `:root` block — so the dark
 * query returned the light block and the parity test compared light with
 * itself, green and meaningless. Anchoring on the selector at line start
 * kills that class of bug.
 */
function blockOf(selector) {
    const start = stylesheet.search(selector);
    if (start === -1) throw new Error(`no block matches ${selector}`);
    const open = stylesheet.indexOf("{", start);
    let depth = 1;
    let end = open + 1;
    while (depth > 0 && end < stylesheet.length) {
        if (stylesheet[end] === "{") depth += 1;
        else if (stylesheet[end] === "}") depth -= 1;
        end += 1;
    }
    return stylesheet.slice(open + 1, end - 1);
}

/** Token name → value for one anchored block. */
function tokensOf(selector) {
    const tokens = Object.fromEntries(
        [...blockOf(selector).matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(
            (entry) => [entry[1], entry[2].trim()]
        )
    );
    if (!Object.keys(tokens).length)
        throw new Error(`no tokens found for ${selector}`);
    return tokens;
}

// Everything shipped in one chunk, so opening the Explorer downloaded and
// parsed the Gantt, the release panel and the memory forms too. React is most
// of what remains and is not worth replacing — the code uses `useDeferredValue`
// and the concurrent renderer deliberately — so the budget is set where the
// entry chunk actually is, with room for a component or two.
test("the entry bundle stays within budget and views load on demand", async () => {
    const staticDir = fileURLToPath(new URL("../dist/ui/static/", import.meta.url));
    const { readdir, stat } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { gzipSync } = await import("node:zlib");

    let names;
    try {
        names = await readdir(staticDir);
    } catch {
        // `check` builds before testing; a bare `node --test` may not have.
        return;
    }

    const scripts = names.filter((name) => name.endsWith(".js"));
    const entry = scripts.filter((name) => name.startsWith("index-"));
    assert.equal(entry.length, 1, `expected one entry chunk, found ${entry}`);

    const gzipped = async (name) =>
        gzipSync(await readFile(join(staticDir, name))).length;

    const entryBytes = await gzipped(entry[0]);
    assert.ok(
        entryBytes < 92_000,
        `entry chunk is ${(entryBytes / 1024).toFixed(1)} kB gzip, over budget`
    );

    // The views really are separate: one chunk each means a session that never
    // opens the Gantt never pays for it.
    const lazy = scripts.filter((name) => !name.startsWith("index-"));
    assert.ok(
        lazy.length >= 5,
        `expected the views to be split out, found ${lazy.length} extra chunks`
    );
    for (const name of lazy) {
        const bytes = (await stat(join(staticDir, name))).size;
        assert.ok(bytes > 0, `${name} is empty`);
    }

    // A demo bundle must never be what gets published: it embeds a snapshot of
    // someone else's workspace and nothing about the file would look wrong.
    for (const name of scripts) {
        const source = await readFile(join(staticDir, name), "utf8");
        assert.equal(
            source.includes("__PROJECT_DEMO_SNAPSHOT__"),
            false,
            `${name} is a demo build`
        );
    }
});

/**
 * The bespoke patterns stay dead (ADR-0005).
 *
 * The audit that predates every migration found eight independent
 * implementations of the same chip. The bespoke rebuild collapsed them into
 * `.chip` / `.tile` / `.dot` classes; the third migration replaced those
 * with Badge, Item and Card. The regression to guard against is the same
 * one it has always been — a surface re-describing a shared pattern in a
 * rule of its own — and its modern form is a bespoke class family creeping
 * back into the stylesheet beside the framework.
 */
test("the bespoke patterns stay dead", async () => {
    for (const pattern of [".chip", ".tile", ".dot", ".panel", ".metagrid"]) {
        const escaped = pattern.replace(".", "\\.");
        const definitions = [
            ...stylesheet.matchAll(new RegExp(`^${escaped}\\s*\\{`, "gm"))
        ];
        assert.equal(
            definitions.length,
            0,
            `${pattern} is declared again — the registry replaced that family`
        );
    }

    // The interface owns exactly two css files: the token bridge and the
    // typeset system for rendered Markdown. A third is a view growing a
    // stylesheet of its own.
    const { readdir } = await import("node:fs/promises");
    const { join, relative, sep } = await import("node:path");
    const base = fileURLToPath(new URL("../ui/src/", import.meta.url));
    const stray = [];
    async function walk(dir) {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) await walk(path);
            else if (entry.name.endsWith(".css")) stray.push(path);
        }
    }
    await walk(base);
    assert.deepEqual(
        stray.map((name) => relative(base, name).split(sep).join("/")).sort(),
        ["styles.css", "typeset.css"],
        "the stylesheet count is fixed on purpose"
    );
});

// Forty-odd copies of the same twelve lines: mkdtemp, copy the fixture, load,
// and a `finally` that removes it. Copies drift — some remembered
// `force: true`, some did not, and one forgot to clean up at all — and a test
// that leaks a temporary directory is invisible until a machine runs out of
// inodes.
test("test workspaces are disposed of", async () => {
    const { readdir, readFile: read } = await import("node:fs/promises");
    const testDir = fileURLToPath(new URL("../test/", import.meta.url));
    const files = (await readdir(testDir)).filter((name) =>
        name.endsWith(".test.ts")
    );

    for (const name of files) {
        const source = await read(`${testDir}${name}`, "utf8");
        const created =
            (source.match(/mkdtemp\(/g) || []).length +
            (source.match(/createTestWorkspace\(/g) || []).length;
        const disposed =
            (source.match(/rm\(\s*\w+,\s*\{\s*recursive/g) || []).length +
            (source.match(/cleanup\(\)/g) || []).length +
            (source.match(/withServer\(/g) || []).length;
        assert.ok(
            disposed >= created,
            `${name} creates ${created} workspaces and disposes of ${disposed}`
        );
    }
});

/**
 * Status and priority are two axes, and must not share a hue.
 *
 * `--priority-critical` was once the same red as the danger colour, so a
 * critical card and an error message were indistinguishable, and
 * `--priority-medium` was the accent blue, so a priority dot looked like a
 * link. If red means two things it means neither.
 */
test("the domain axes stay visually distinct", () => {
    const root = tokensOf(/^:root \{/m);
    const axes = Object.entries(root).filter(
        ([name]) => name.startsWith("--status-") || name.startsWith("--priority-")
    );
    assert.ok(axes.length >= 10, "both axes are declared");
    const seen = new Map();
    for (const [name, value] of axes) {
        // `deferred` and `discarded` deliberately alias another state.
        if (["--status-deferred", "--status-discarded"].includes(name)) continue;
        const clash = seen.get(value);
        assert.equal(
            clash,
            undefined,
            `${name} and ${clash} are the same colour, so neither can teach anything`
        );
        seen.set(value, name);
    }
});

/**
 * Whatever light declares, dark must declare too.
 *
 * A token defined in only one theme does not fall back to something sensible:
 * it resolves to nothing, and the property it feeds is simply dropped.
 */
test("both themes define the same tokens", () => {
    const light = new Set(Object.keys(tokensOf(/^:root \{/m)));
    const dark = new Set(Object.keys(tokensOf(/^\[data-theme="dark"\] \{/m)));
    // `--radius` and the density row height are theme-independent on purpose.
    const themed = [...light].filter(
        (name) => !["--radius", "--row-h"].includes(name)
    );
    const missing = themed.filter((name) => !dark.has(name));
    assert.deepEqual(missing, [], `dark theme is missing: ${missing.join(", ")}`);
});

/**
 * Declared tokens are used tokens.
 *
 * A token nothing references is dead weight that reads as an extension
 * point, and the next person "uses" it believing it is wired to something.
 * Tokens are consumed three ways now: a `var()` in the stylesheet itself,
 * a `var()` in a component, or the `@theme inline` mapping that turns them
 * into Tailwind utilities — the mapping counts as the reference, because
 * the generated CSS that consumes it is not on disk to scan.
 */
test("every declared token is referenced somewhere", async () => {
    const { readdir, readFile: read } = await import("node:fs/promises");
    const base = fileURLToPath(new URL("../ui/src/", import.meta.url));
    let application = "";
    async function walk(dir) {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const path = `${dir}/${entry.name}`;
            if (entry.isDirectory()) await walk(path);
            else if (/\.(ts|tsx)$/.test(entry.name))
                application += await read(path, "utf8");
        }
    }
    await walk(base.replace(/\/$/, ""));

    // Declared = the theme blocks only. The `@theme inline` block is the
    // utility bridge, not a token source: its entries exist to be consumed
    // by generated CSS, so they are exempt as declarations and counted as
    // references for the tokens they map.
    const themeBlocks = [
        blockOf(/^:root \{/m),
        blockOf(/^\[data-theme="dark"\] \{/m),
        blockOf(/^:root\[data-density="comfortable"\] \{/m)
    ].join("\n");
    const declared = [...themeBlocks.matchAll(/(--[\w-]+)\s*:/g)].map(
        (match) => match[1]
    );
    const unused = [...new Set(declared)].filter((token) => {
        if (stylesheet.includes(`var(${token}`)) return false;
        if (application.includes(`var(${token}`)) return false;
        // Status, priority and severity tokens are addressed dynamically:
        // theme.ts builds `var(--status-${status})` at runtime.
        return !/^--(status|priority|sev)-/.test(token);
    });
    assert.deepEqual(
        unused,
        [],
        `declared but never referenced: ${unused.join(", ")}`
    );
});
