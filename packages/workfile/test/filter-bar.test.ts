import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const uiRoot = new URL("../ui/src/", import.meta.url);

/**
 * Every ui/src source file, path → content.
 *
 * Line endings are normalised because CI runs Windows as well: a checkout with
 * `core.autocrlf` on turns every multi-line pattern below into a silent miss,
 * and a source-reading test that matches nothing still reports green
 * (LRN-0026).
 */
async function sources(): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    async function walk(dir: string) {
        for (const entry of await readdir(new URL(dir, uiRoot), {
            withFileTypes: true
        })) {
            const path = `${dir}${entry.name}`;
            if (entry.isDirectory()) await walk(`${path}/`);
            else if (/\.(ts|tsx)$/.test(entry.name))
                result.set(
                    path,
                    (await readFile(new URL(path, uiRoot), "utf8")).replace(
                        /\r\n/g,
                        "\n"
                    )
                );
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

const BAR = "components/FilterBar.tsx";

/**
 * The strip is one component, not a class list copied per view.
 *
 * Five views carried their own: the shell, Docs, History, Memory and the
 * Gantt toolbar, each with a slightly different idea of the gap and the
 * gutter, and three of them declared their own `FilterChip` on top of that.
 * The copies are what let the touch defect live in four places at once and be
 * filed as one, so the rule that keeps it fixed is that there is one of it.
 */
test("the control strip and its chips are declared once", async () => {
    const all = await sources();
    const app = appSources(all);
    assert.ok(app.get(BAR), `ui/src/${BAR} is gone`);

    // A horizontal control scroller: hidden gutter and an overflow axis in
    // one class list. Content scrollers (lanes, boards, tables) show their
    // bar and do not match.
    for (const [path, source] of app) {
        if (path === BAR) continue;
        for (const match of source.matchAll(/className=\{?["'`]([^"'`]*)/g)) {
            const classes = match[1];
            assert.ok(
                !(
                    classes.includes("no-scrollbar") &&
                    classes.includes("overflow-x-auto")
                ),
                `${path} declares a control strip of its own: "${classes}"`
            );
        }
    }

    for (const control of ["FilterBar", "FilterChip", "FilterToggle"]) {
        const owners = [...app]
            .filter(([, source]) =>
                new RegExp(`function ${control}\\b`).test(source)
            )
            .map(([path]) => path);
        assert.deepEqual(
            owners,
            [BAR],
            `${control} is declared somewhere other than the shared module`
        );
    }
});

/**
 * A filter control only ever renders inside the bar that owns the scrolling.
 *
 * A chip dropped into a plain flex row wraps instead of scrolling, which is
 * the state Workflow's kind and relation filters were in, and it is invisible
 * in review because the chip itself looks right.
 */
test("every filter control is rendered inside the shared bar", async () => {
    const app = appSources(await sources());
    let rendered = 0;
    for (const [path, source] of app) {
        if (path === BAR) continue;
        if (!/<Filter(Chip|Toggle)\b/.test(source)) continue;
        rendered += 1;
        assert.match(
            source,
            /<FilterBar\b/,
            `${path} renders filter controls outside a FilterBar`
        );
        assert.match(
            source,
            /import \{[^}]*\bFilterBar\b[^}]*\} from "\.{1,2}\/(components\/)?FilterBar"/,
            `${path} does not import the shared bar`
        );
    }
    assert.ok(rendered >= 5, `only ${rendered} views render filter controls`);
});

/**
 * The bleed matches the gutter it bleeds through.
 *
 * The strip runs to the screen edge by cancelling its container's padding and
 * re-applying it inside the scrollport, so the two halves are one measurement
 * written twice. A pair that drifts leaves every chip a few points off the
 * gutter the title above it keeps — visible forever, and to nobody.
 */
test("each bleed cancels exactly the gutter it sits in", async () => {
    const bar = (await sources()).get(BAR) ?? "";
    const table = bar.slice(
        bar.indexOf("const GUTTER = {"),
        bar.indexOf("} as const;")
    );
    assert.ok(table, "the gutter table is gone");
    const entries = [
        ...table.matchAll(
            /"?[\w.]+"?:\s*\{\s*bar:\s*"([^"]*)",\s*bleed:\s*"([^"]*)"\s*\}/g
        )
    ];
    assert.ok(entries.length >= 2, "the gutter table looks emptied out");
    for (const [, padding, bleed] of entries) {
        if (!padding) {
            assert.equal(
                bleed,
                "",
                "a bar with no gutter has nothing to bleed through"
            );
            continue;
        }
        const size = /^px-(.+)$/.exec(padding)?.[1];
        assert.ok(size, `"${padding}" is not a horizontal padding utility`);
        assert.equal(
            bleed,
            `-mx-${size} px-${size}`,
            `the bleed for ${padding} does not cancel it`
        );
    }
});

/**
 * The chip refuses the press and opens on the click.
 *
 * This is the whole of T-0193 and it is the one thing this suite cannot run:
 * there is no DOM here, and a synthetic event would not reach the compositor
 * that decides whether a finger is scrolling. It was measured in a browser
 * instead — Chromium at 390 points with touch emulation, dragging 170 points
 * from the centre of a chip: 0 points of scroll and an open menu before, the
 * full 170 and no menu after.
 *
 * What is checked here is that the mechanism is still the one that was
 * measured, because it reverts silently: delete four lines and every chip
 * still opens on a tap, still opens on a click, still passes every other test
 * in this file, and only a finger on a phone can tell.
 */
test("the chip does not hand the press to the primitive", async () => {
    const bar = (await sources()).get(BAR) ?? "";
    // Radix opens from a `pointerdown` handler it composes after this one and
    // skips once the event is default-prevented. Touch and pen only: pressing
    // and dragging onto an item is a real way to use a menu with a mouse.
    assert.match(
        bar,
        /onPointerDown=\{\(event\) => \{[\s\S]{0,240}?pointerType !== "mouse"[\s\S]{0,160}?preventDefault\(\)/,
        "the chip no longer keeps the primitive off pointerdown"
    );
    assert.match(
        bar,
        /onClick=\{\(\) => \{[\s\S]{0,240}?setOpen\(/,
        "the chip no longer opens on the click"
    );
    // Controlled, because the click has to be able to open something the
    // primitive is no longer opening for it.
    assert.match(bar, /<DropdownMenu open=\{open\} onOpenChange=\{setOpen\}>/);
});

/**
 * The fix stays in application code.
 *
 * `components/ui/` is generated: shadcn rewrites it on the next `add`, and a
 * pointer rule hidden in the primitive would take every menu in the
 * application with it — including the record menus, where pressing and
 * dragging is how the control is meant to be used.
 */
test("the generated menu primitive is left alone", async () => {
    const all = await sources();
    const registry = all.get("components/ui/dropdown-menu.tsx");
    assert.ok(registry, "the dropdown-menu registry file is gone");
    assert.doesNotMatch(
        registry,
        /pointerType|preventDefault/,
        "the touch rule was written into the generated primitive"
    );
});
