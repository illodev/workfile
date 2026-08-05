import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

/**
 * The shell's chrome — the sidebar rail and the app header — read as source
 * text. There is no DOM harness in this suite, so these are structural
 * assertions about decisions that are invisible at runtime until someone
 * notices the symptom weeks later.
 */
const read = (name: string) =>
    readFile(new URL(`../ui/src/${name}`, import.meta.url), "utf8");

/** The `function NavTooltip(...) { ... }` block, closing brace included. */
function navTooltipSource(main: string) {
    const source = /function NavTooltip\([\s\S]*?\n}\n/.exec(main)?.[0];
    assert.ok(source, "NavTooltip is gone from main.tsx");
    return source;
}

test("every destination names itself once the rail is icons only", async () => {
    const main = await read("main.tsx");
    // One assertion covers all eleven: they render from the single
    // `group.items.map` over NAV_GROUPS, which `navigation.test.ts` already
    // holds to the whole `View` union.
    assert.match(
        main,
        /<NavTooltip\s+label=\{option\.label\}\s*>\s*<SidebarMenuButton/,
        "the sidebar items no longer carry the label the collapsed rail hides"
    );
});

/**
 * The registry's own `tooltip` prop looks like the answer and is not: it
 * renders the tooltip in both states and only marks it `hidden` while the
 * rail is expanded. Hidden is not unmounted — Radix still opens it on hover,
 * and an open tooltip is a dismissable layer that answers Escape in the
 * capture phase. Resting the pointer on an expanded rail would then take
 * Escape away from the shell with nothing on screen to explain it, which is
 * the exact failure the global Escape handler is written to prevent.
 */
test("the tooltip is not mounted while the label is already visible", async () => {
    const main = await read("main.tsx");
    const source = navTooltipSource(main);
    assert.match(
        source,
        /state === "collapsed" && !isMobile/,
        "NavTooltip no longer asks whether the labels are hidden"
    );
    assert.match(
        source,
        /\{collapsed \? \(\s*<TooltipContent/,
        "the tooltip content is mounted unconditionally"
    );
    assert.doesNotMatch(
        main,
        /tooltip=/,
        "the registry's tooltip prop keeps the tooltip open on an expanded "
            + "rail, where it silently swallows Escape"
    );
});

/**
 * Toggling the rail must not rebuild the buttons. Radix returns the tooltip
 * to the trigger, so a `Tooltip` that mounts and unmounts with the collapsed
 * state changes the element type at that position and React answers by
 * replacing the `<button>` underneath — dropping keyboard focus every time
 * the sidebar shortcut is pressed.
 */
test("the tooltip wrapper survives the rail collapsing", async () => {
    const source = navTooltipSource(await read("main.tsx"));
    assert.match(
        source,
        /<Tooltip>\s*<TooltipTrigger asChild>\{children\}<\/TooltipTrigger>/,
        "the Tooltip is now conditional, so the button remounts on every toggle"
    );
});

test("row density and the theme are settings, not header buttons", async () => {
    const main = await read("main.tsx");
    for (const gone of ["Toggle row density", "Toggle theme"]) {
        assert.doesNotMatch(
            main,
            new RegExp(`aria-label="${gone}"`),
            `${gone} is back in the app header`
        );
    }
    assert.match(main, /<SettingsDialog/, "the header lost the settings dialog");

    const settings = await read("components/Settings.tsx");
    assert.match(settings, /<DialogTitle>Settings<\/DialogTitle>/);
    assert.match(
        settings,
        /aria-label="Settings"/,
        "the trigger has no accessible name"
    );
    for (const setting of ['label="Theme"', 'label="Row density"']) {
        assert.ok(
            settings.includes(setting),
            `the dialog no longer offers ${setting}`
        );
    }
});

/**
 * The dialog renders state it does not own. Persistence stayed byte for byte
 * where it was, in the shell, next to the effects that stamp the root
 * element — a preference that only survives while its dialog is mounted is
 * the regression this pins.
 */
test("both preferences persist exactly where they did", async () => {
    const main = await read("main.tsx");
    for (const expression of [
        'localStorage.getItem("workfile-theme")',
        'localStorage.setItem("workfile-theme", dark ? "dark" : "light")',
        'localStorage.getItem("workfile-density") === "comfortable"',
        'localStorage.setItem("workfile-density", density)',
        'document.documentElement.dataset.theme = dark ? "dark" : "light"',
        'document.documentElement.dataset.density = "comfortable"'
    ]) {
        assert.ok(
            main.includes(expression),
            `the shell no longer carries ${expression}`
        );
    }
    assert.doesNotMatch(
        await read("components/Settings.tsx"),
        /localStorage\.[gs]etItem/,
        "the dialog took over persistence the shell owns"
    );
});
