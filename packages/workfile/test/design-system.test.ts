import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const styles = await read("ui/src/styles.css");
const typeset = await read("ui/src/typeset.css");
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

/** App code: everything except the generated registry and its support files. */
function appSources(all: Map<string, string>): Map<string, string> {
    const generated = /^(components\/ui\/|lib\/|hooks\/)/;
    return new Map([...all].filter(([path]) => !generated.test(path)));
}

/** The brace-delimited body of the first block whose selector matches. */
function blockOf(css, selector) {
    const start = css.search(selector);
    assert.notEqual(start, -1, `no block matches ${selector}`);
    const open = css.indexOf("{", start);
    let depth = 1;
    let end = open + 1;
    while (depth > 0 && end < css.length) {
        if (css[end] === "{") depth += 1;
        else if (css[end] === "}") depth -= 1;
        end += 1;
    }
    return css.slice(open + 1, end - 1);
}

/**
 * The stylesheet carries the framework (ADR-0005).
 *
 * The third migration inverted ADR-0004: shadcn/ui on Tailwind v4 IS the
 * design system now, adopted wholesale, and the stylesheet is the token
 * bridge rather than the whole look. What must never regress: the typeface
 * ships with the package, the dark palette stays keyed to the `data-theme`
 * attribute the app stamps, and the three semantic namespaces — the one
 * exception ADR-0005 allows — stay declared in both themes.
 */
test("the stylesheet carries the framework", () => {
    assert.match(styles, /@import "tailwindcss";/);
    assert.match(styles, /@import "tw-animate-css";/);
    assert.match(styles, /@import "shadcn\/tailwind\.css";/);
    assert.match(styles, /@import "\.\/typeset\.css";/);
    // The typeface still ships with the package rather than from a CDN.
    assert.match(styles, /@import "@fontsource-variable\/geist";/);
    assert.match(styles, /@import "@fontsource-variable\/geist-mono";/);
    // The registry's `dark:` utilities ride the app's own theme switch.
    assert.match(
        styles,
        /@custom-variant dark \(&:is\(\[data-theme="dark"\] \*\)\);/
    );
    // Utility bridge for the tokens — @theme is how Tailwind v4 learns them.
    assert.match(styles, /@theme inline \{/);
});

/**
 * The semantic namespaces survive in both palettes. A status colour that
 * exists only in light mode renders as "inherits something odd" in dark —
 * never as an error.
 */
test("the semantic namespaces exist in both themes", () => {
    const namespaces = [
        ...[
            "backlog",
            "next",
            "doing",
            "review",
            "blocked",
            "deferred",
            "done",
            "discarded"
        ].map((s) => `--status-${s}`),
        ...["critical", "high", "medium", "low"].map((p) => `--priority-${p}`),
        ...["error", "warning", "info"].map((s) => `--sev-${s}`)
    ];
    const light = blockOf(styles, /^:root \{/m);
    const dark = blockOf(styles, /^\[data-theme="dark"\] \{/m);
    for (const token of namespaces) {
        assert.match(
            light,
            new RegExp(`${token}:`),
            `${token} missing from :root`
        );
        assert.match(
            dark,
            new RegExp(`${token}:`),
            `${token} missing from the dark palette`
        );
    }
});

/**
 * The framework is build-time only. The published package still carries no
 * runtime tree: everything shadcn needs is a devDependency, and the
 * `dependencies` line is the same one `dependencies.test.ts` freezes —
 * asserted here a second time, from the other direction, on purpose.
 */
test("the framework stack is build-only", () => {
    const dev = Object.keys(pkg.devDependencies);
    for (const name of [
        "tailwindcss",
        "@tailwindcss/vite",
        "tw-animate-css",
        "class-variance-authority",
        "clsx",
        "tailwind-merge",
        "cmdk",
        "lucide-react",
        "radix-ui"
    ]) {
        assert.ok(dev.includes(name), `${name} must be a devDependency`);
    }
    // Packages the migration decided against: never installed, any of them
    // appearing again means an unreviewed `shadcn add` wrote dependencies.
    const declared = Object.keys({
        ...pkg.dependencies,
        ...pkg.devDependencies
    });
    for (const name of [
        "sonner",
        "react-resizable-panels",
        "next-themes",
        "vaul"
    ]) {
        assert.ok(!declared.includes(name), `${name} is back in package.json`);
    }
    // The runtime dependency surface of the published package is types only.
    assert.deepEqual(Object.keys(pkg.dependencies), ["@types/node"]);
});

/**
 * The registry is the component system. Generated files live in
 * components/ui/, never import application code, and the app reaches them
 * through the @/ alias — the inversion of the rule this file used to hold.
 */
test("the registry is the component system", async () => {
    const base = new URL("../ui/src/components/ui/", import.meta.url);
    assert.ok(existsSync(base), "components/ui/ registry is missing");
    const registry = (await readdir(base)).filter((f) => f.endsWith(".tsx"));
    assert.ok(registry.length >= 20, "the registry looks emptied out");
    const all = await sources();
    for (const [path, source] of all) {
        if (!path.startsWith("components/ui/")) continue;
        assert.doesNotMatch(
            source,
            /from "(\.\.\/(?!ui\/)|@\/components\/domain|@\/api|@\/theme|@\/types|@\/query)/,
            `${path} is generated and must not import application code`
        );
    }
    // kit.tsx is gone; nothing may quietly resurrect it.
    assert.ok(
        !existsSync(new URL("../ui/src/kit.tsx", import.meta.url)),
        "kit.tsx is back — the registry replaced it"
    );
});

/**
 * No bespoke vocabulary survives. These class names had 1560 lines of CSS
 * behind them once; now they would render as nothing, silently. A survivor
 * is a migration hole, not a style choice.
 */
test("no component speaks the bespoke vocabulary", async () => {
    const bespoke =
        /\b(iconbtn|statuschip|searchbtn|metagrid|reflink|grid-table|view-head|view-title|view-body|nav-item|nav-group|nav-count|topbar|crumb-sep|dialog-overlay|dialog-head|dialog-foot|menu-item|btn-accent|dot-round|chip-value|facet)\b/;
    for (const [path, source] of appSources(await sources())) {
        for (const match of source.matchAll(
            /className=\{?["'`]([^"'`]*)["'`]/g
        )) {
            assert.doesNotMatch(
                match[1],
                bespoke,
                `${path} still uses the bespoke class "${match[1]}"`
            );
        }
    }
});

/**
 * Colour discipline survives the framework: components name tokens or
 * utilities, never colours. A literal colour in a component is invisible to
 * the theme switch and to any future palette change.
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
 * Every token a component asks for exists. A `var(--typo)` does not error:
 * the declaration that uses it is silently dropped, which renders as
 * "transparent" or "inherits something odd", never as a message. The
 * declared set is the stylesheet plus typeset.css; families provided at
 * runtime are exempt.
 */
test("every var() a component references is declared", async () => {
    const declared = new Set(
        [...(styles + typeset).matchAll(/(--[\w-]+)\s*:/g)].map(
            (match) => match[1]
        )
    );
    // Provided at runtime, not by the stylesheet: Tailwind's spacing scale,
    // Radix measurement vars, the sidebar's own inline declarations, typeset
    // knobs, and the inspector width the shell sets inline on its rail.
    const external =
        /^--(spacing|radix-|sidebar-width|typeset-|tw-|inspector-w|header-height)/;
    for (const [path, source] of await sources()) {
        for (const match of source.matchAll(/var\((--[\w-]+)\s*[),]/g)) {
            if (external.test(match[1])) continue;
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
