import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

// Same reasoning as the filter-search suite: skipping locally is fine,
// skipping in CI would report green with zero coverage.
const canLoadTypeScript = Boolean(process.features.typescript);
if (!canLoadTypeScript && process.env.CI) {
    throw new Error(
        "This runtime cannot strip TypeScript types, so the control scale would go "
        + "unchecked while CI still reported green. Run CI on Node >= 22.18."
    );
}

// The fallback takes the callback it will not run, because the strict program
// is the only one that compiles the tests and it checks arity: a one-parameter
// stub standing in for `test` makes every call site below a TS2554.
const suite = canLoadTypeScript
    ? test
    : (name: string, _run?: unknown) =>
          test(name, { skip: "runtime cannot strip TypeScript types" }, () => {});

const uiRoot = new URL("../ui/src/", import.meta.url);

// CI runs Windows, where the checkout arrives with CRLF line endings. Every
// assertion below matches against source text, so the newlines are normalised
// at the door rather than in each pattern (LRN-0026).
const read = async (path: string) =>
    (await readFile(new URL(path, uiRoot), "utf8")).replace(/\r\n/g, "\n");

/** Every ui/src source file, path → content. */
async function sources() {
    const result = new Map<string, string>();
    async function walk(dir: string) {
        for (const entry of await readdir(new URL(dir, uiRoot), {
            withFileTypes: true
        })) {
            const path = `${dir}${entry.name}`;
            if (entry.isDirectory()) await walk(`${path}/`);
            else if (/\.(ts|tsx)$/.test(entry.name))
                result.set(path, await read(path));
        }
    }
    await walk("");
    return result;
}

/** The primitives that carry a rung, and must all carry the same one. */
const PRIMITIVES = [
    "components/ui/button.tsx",
    "components/ui/input.tsx",
    "components/ui/input-group.tsx",
    "components/ui/native-select.tsx"
];

/** The body of every `size: {` variant block in a source file. */
function sizeBlocks(source: string): string[] {
    const blocks: string[] = [];
    for (const match of source.matchAll(/\bsize:\s*\{/g)) {
        let depth = 1;
        let index = match.index + match[0].length;
        const start = index;
        while (depth > 0 && index < source.length) {
            if (source[index] === "{") depth += 1;
            else if (source[index] === "}") depth -= 1;
            index += 1;
        }
        blocks.push(source.slice(start, index - 1));
    }
    return blocks;
}

/** `xs: "…"` or ``"icon-sm": `…` `` → the rung name and the classes it sets. */
function rungs(block: string): Array<[string, string]> {
    return [...block.matchAll(/(?:"([\w-]+)"|([\w-]+)):\s*([`"][^`"]*[`"])/g)].map(
        (match) => [match[1] ?? match[2], match[3]] as [string, string]
    );
}

/**
 * The scale is a ladder, and the default is near the bottom of it.
 *
 * Two of the three reports behind T-0194 were about size in the abstract —
 * "larger than a record tool needs" — which is only actionable once the
 * rungs are ordered and one of them is named the default. 4px to a rung,
 * four rungs, and `default` sits second: the registry shipped 36px and every
 * field in this application had already been patched down to 32 by hand
 * before the scale existed.
 */
suite("the control scale is an ordered ladder with a small default", async () => {
    const scale = await import("../ui/src/components/ui/control-size.ts");
    const { CONTROL_HEIGHT, CONTROL_SQUARE } = scale;

    const order = Object.keys(CONTROL_HEIGHT);
    assert.deepEqual(
        order,
        ["xs", "sm", "default", "lg"],
        "the rungs are declared smallest first, and `default` is one of them"
    );

    const step = (value: string) => {
        const match = /^(?:h|size)-(\d+)$/.exec(value);
        assert.ok(match, `${value} is not a plain Tailwind step`);
        return Number(match[1]);
    };
    const heights = order.map((name) => step(CONTROL_HEIGHT[name]));
    for (const [index, height] of heights.entries()) {
        if (index === 0) continue;
        assert.ok(
            height > heights[index - 1],
            `rung ${order[index]} is not taller than ${order[index - 1]}`
        );
    }

    // A square icon button sits in the same row as a labelled one, so the two
    // ladders have to be the same ladder.
    assert.deepEqual(
        order.map((name) => step(CONTROL_SQUARE[name])),
        heights,
        "CONTROL_SQUARE has drifted off CONTROL_HEIGHT"
    );

    // "The default button size is the smaller one" — it may never be the top
    // of the ladder, which is what it was when the card was written.
    const defaultIndex = order.indexOf("default");
    assert.ok(
        defaultIndex < order.length - 1 && defaultIndex > 0,
        "the default rung is at an end of the ladder rather than near its foot"
    );
});

/**
 * Every primitive composes its heights from the shared table.
 *
 * This is the whole mechanism. A button, a field and a select mix in one
 * toolbar, and until they read from one table each carried its own idea of
 * `sm` — 32px, 36px-whatever-you-asked, and two rungs only. Composition is
 * what makes "the same declared size is the same height" true without
 * anybody measuring it.
 */
suite("the primitives take their heights from the shared table", async () => {
    for (const path of PRIMITIVES) {
        const source = await read(path);
        assert.match(
            source,
            /from "@\/components\/ui\/control-size"/,
            `${path} does not read the shared scale`
        );
        for (const block of sizeBlocks(source)) {
            for (const [rung, classes] of rungs(block)) {
                const table = rung.startsWith("icon")
                    ? "CONTROL_SQUARE"
                    : "CONTROL_HEIGHT";
                const key = rung.replace(/^icon-?/, "") || "default";
                assert.ok(
                    classes.includes(`${table}.${key}`),
                    `${path} sets ${rung} without ${table}.${key}: ${classes}`
                );
                // Only the height. A rung also sets the glyph size of an
                // icon it contains (`[&_svg…]:size-3`), which is type, not
                // geometry, and belongs to the rung that declares it.
                assert.doesNotMatch(
                    classes,
                    /(?:^|[\s"'`])h-\d/,
                    `${path} writes a literal height into the ${rung} rung`
                );
            }
        }
    }
});

/**
 * No view restates a height the scale already has.
 *
 * Fifteen call sites wrote `h-7` over whichever primitive they had reached
 * for, and that is the bug: the Memory field was one rung taller than the
 * chips beside it because the two were sized in different files by different
 * people. Arbitrary values are untouched — the Explorer's row select is
 * `h-[22px]` on purpose, and that syntax is how a view says "deliberately
 * off the scale" rather than "I could not reach the scale".
 */
suite("no view writes a rung height onto a control", async () => {
    const CONTROLS = [
        "Button",
        "Input",
        "InputGroup",
        "InputGroupInput",
        "InputGroupButton",
        "NativeSelect"
    ];
    const opening = new RegExp(`<(${CONTROLS.join("|")})(?=[\\s/>])`, "g");

    for (const [path, source] of await sources()) {
        // The registry is where the scale is implemented; the rule is about
        // the views that consume it.
        if (/^(components\/ui\/|lib\/|hooks\/)/.test(path)) continue;
        for (const match of source.matchAll(opening)) {
            // Walk to the end of the opening tag, stepping over the braces
            // and strings a JSX prop can contain.
            let index = match.index + match[0].length;
            let depth = 0;
            let end = source.length;
            for (; index < source.length; index += 1) {
                const char = source[index];
                if (char === "{") depth += 1;
                else if (char === "}") depth -= 1;
                else if (char === '"' || char === "'" || char === "`") {
                    const quote = char;
                    index += 1;
                    while (index < source.length && source[index] !== quote) {
                        if (source[index] === "\\") index += 1;
                        index += 1;
                    }
                } else if (char === ">" && depth === 0) {
                    end = index;
                    break;
                }
            }
            const tag = source.slice(match.index, end);
            const line = source.slice(0, match.index).split("\n").length;
            assert.doesNotMatch(
                tag,
                /(?:^|[\s:"'`])h-\d/,
                `${path}:${line} sizes a <${match[1]}> by hand — declare a rung`
            );
        }
    }
});

/**
 * The field and the chips beside it declare the same rung.
 *
 * This is the Memory report, stated as a rule. `FilterSearch` and the two
 * chip controls live in different files and appear in the same strip in six
 * views; nothing but this keeps them level.
 */
suite("the filter bar's field and chips sit on one rung", async () => {
    const search = await read("components/FilterSearch.tsx");
    const bar = await read("components/FilterBar.tsx");

    const declared = /<InputGroup\s+size="(\w+)"/.exec(search);
    assert.ok(declared, "FilterSearch no longer declares a rung");

    const chips = [...bar.matchAll(/<Button\b[\s\S]*?size="([\w-]+)"/g)].map(
        (match) => match[1]
    );
    assert.ok(chips.length >= 2, "FilterBar's chip controls are gone");
    for (const chip of chips) {
        assert.equal(
            chip,
            declared[1],
            "a filter chip and the search field beside it declare different rungs"
        );
    }
});

/**
 * The Triage header can break rather than overflow.
 *
 * Only a browser can prove the header fits — this pins the mechanism, the
 * way `test/filter-bar.test.ts` pins the chip's pointer rule. The controls
 * are all `shrink-0` by the button's own base class, so a row that cannot
 * wrap has nowhere to put the overflow but off the right edge; and the two
 * widest labels come off below `sm`, where the keyboard the shortcut badges
 * advertise does not exist either.
 */
suite("the Triage header wraps and sheds its labels when narrow", async () => {
    const source = await read("components/Triage.tsx");
    const header = /<div className="flex flex-wrap[^"]*">/.exec(source);
    assert.ok(header, "the Triage header is no longer allowed to wrap");

    assert.match(
        source,
        /<Kbd className="max-sm:hidden">K<\/Kbd>/,
        "the Previous shortcut badge is back on a phone"
    );
    assert.match(
        source,
        /<Kbd className="max-sm:hidden">J<\/Kbd>/,
        "the Next shortcut badge is back on a phone"
    );
    // The label goes, the name stays: the button is still announced.
    assert.match(
        source,
        /aria-label="Open full card"/,
        "the icon-only form of the open control is unnamed"
    );
    assert.match(
        source,
        /<span className="max-sm:hidden">Open full card<\/span>/,
        "the widest label in the header no longer collapses"
    );
});
