import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const styles = await read("ui/src/styles.css");
const pkg = JSON.parse(await read("package.json"));

/** Every ui/src source file, path → content. */
async function sources() {
    const base = new URL("../ui/src/", import.meta.url);
    const result = new Map();
    async function walk(dir) {
        for (const entry of await readdir(new URL(dir, base), {
            withFileTypes: true
        })) {
            const path = `${dir}${entry.name}`;
            if (entry.isDirectory()) await walk(`${path}/`);
            else if (/\.(ts|tsx)$/.test(entry.name))
                result.set(path, await readFile(new URL(path, base), "utf8"));
        }
    }
    await walk("");
    return result;
}

/**
 * The stylesheet is the whole design system (ADR-0010).
 *
 * Two migrations proved that a framework underneath this interface ends up
 * being fought, not used. The bespoke system has exactly two moving parts:
 * the tokens and the component classes, both in one file. A framework import
 * reappearing here is the start of the third migration.
 */
test("the stylesheet carries no framework", () => {
    assert.doesNotMatch(styles, /@import "tailwindcss/);
    assert.doesNotMatch(styles, /@import "shadcn/);
    assert.doesNotMatch(styles, /@source\b/);
    assert.doesNotMatch(styles, /@theme\b/);
    // The typeface still ships with the package rather than from a CDN.
    assert.match(styles, /@import "@fontsource-variable\/geist";/);
    assert.match(styles, /@import "@fontsource-variable\/geist-mono";/);
});

test("the framework dependencies stayed removed", () => {
    const declared = Object.keys({
        ...pkg.dependencies,
        ...pkg.devDependencies
    });
    for (const name of [
        "tailwindcss",
        "@tailwindcss/vite",
        "shadcn",
        "tw-animate-css",
        "class-variance-authority",
        "tailwind-merge",
        "clsx",
        "cmdk",
        "sonner",
        "react-resizable-panels",
        "next-themes"
    ]) {
        assert.ok(!declared.includes(name), `${name} is back in package.json`);
    }
    // The runtime dependency surface of the published package is types only.
    assert.deepEqual(Object.keys(pkg.dependencies), ["@types/node"]);
});

test("no component imports a registry or an alias", async () => {
    for (const [path, source] of await sources()) {
        assert.doesNotMatch(
            source,
            /from "@\//,
            `${path} imports through the deleted @ alias`
        );
        assert.doesNotMatch(
            source,
            /components\/ui\//,
            `${path} references the deleted shadcn registry`
        );
    }
});

/**
 * Colour discipline: components name tokens, never colours.
 *
 * The design file's own idiom — every status, priority and severity colour is
 * a `var(--…)` applied inline, resolved by the stylesheet per theme. A literal
 * colour in a component is invisible to the theme switch and to any future
 * palette change, which is exactly how the old system accreted eight kinds of
 * pill.
 */
test("components contain no colour literals", async () => {
    const literal = /oklch\(|#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;
    for (const [path, source] of await sources()) {
        for (const [index, line] of source.split("\n").entries()) {
            if (!literal.test(line)) continue;
            assert.ok(
                false,
                `${path}:${index + 1} names a colour instead of a token: ${line.trim()}`
            );
        }
    }
});

/**
 * Every token a component asks for exists.
 *
 * A `var(--typo)` does not error: the declaration that uses it is silently
 * dropped, which renders as "transparent" or "inherits something odd", never
 * as a message. The stylesheet is the single registry of tokens, so the check
 * is a set difference.
 */
test("every var() a component references is declared", async () => {
    const declared = new Set(
        [...styles.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1])
    );
    for (const [path, source] of await sources()) {
        // The name must end at the closing paren or a fallback comma:
        // `var(--status-${status})` in theme.ts is dynamic and is checked by
        // the domain-axes test instead.
        for (const match of source.matchAll(/var\((--[\w-]+)\s*[),]/g)) {
            assert.ok(
                declared.has(match[1]),
                `${path} references ${match[1]}, which styles.css never declares`
            );
        }
    }
});

test("the dark palette follows the app's theme switch", () => {
    // The app toggles `data-theme` on the root element; a palette keyed to
    // anything else leaves half the interface in the wrong theme.
    assert.match(styles, /\[data-theme="dark"\]\s*\{/);
    assert.match(styles, /color-scheme:\s*dark/);
});

test("fonts are served with a type a browser will accept", async () => {
    const server = await read("src/server/http.ts");
    assert.match(server, /woff2: "font\/woff2"/);
});
