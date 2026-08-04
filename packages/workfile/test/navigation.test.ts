import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { CARD_VIEWS, viewForRecord } from "../ui/src/navigation.ts";
import type { View } from "../ui/src/types.ts";

/**
 * The bug this covers was silent in both directions.
 *
 * A `[[DOC-0002]]` in a card body set the selection to a record the card
 * inspector cannot render, so the sheet closed, the view never changed, and
 * nothing was logged. And every card click routed to Explorer, so following
 * `depends` from inside Flow ejected the reader off the board on the first hop.
 */
test("a record that the current view cannot show is the only reason to navigate", () => {
    for (const view of CARD_VIEWS) {
        assert.equal(
            viewForRecord("T-0042", view, true),
            null,
            `${view} already shows cards and must not navigate`
        );
    }
    for (const view of ["docs", "memory", "history", "health"] as View[]) {
        assert.equal(viewForRecord("T-0042", view, true), "explorer");
    }
});

test("every record kind reaches the view that renders it", () => {
    // From a card view, so `null` here would mean "stay", which for a record
    // the board cannot draw is the closed-sheet-and-nothing-happens failure.
    const from: View = "flow";
    assert.equal(viewForRecord("DOC-0002", from), "docs");
    assert.equal(viewForRecord("PATH-0001", from), "docs");
    assert.equal(viewForRecord("CHG-0110", from), "history");
    assert.equal(viewForRecord("REL-0017", from), "history");
    assert.equal(viewForRecord("ADR-0010", from), "memory");
    assert.equal(viewForRecord("LRN-0018", from), "memory");
    assert.equal(viewForRecord("CONV-0001", from), "memory");
    // Memory is the fallback, so an ID from a collection nobody has named yet
    // still lands somewhere that lists it rather than nowhere.
    assert.equal(viewForRecord("INC-0003", from), "memory");
});

test("a card is recognised by the caller's corpus before its prefix", () => {
    // `cards.idPrefix` is configurable, so a project whose cards are `TASK-`
    // would route every one of them to Memory on the prefix test alone. The
    // caller holds the corpus and says so.
    assert.equal(viewForRecord("TASK-0007", "docs", true), "explorer");
    assert.equal(viewForRecord("TASK-0007", "flow", true), null);
    assert.equal(
        viewForRecord("TASK-0007", "flow"),
        "memory",
        "without the corpus there is nothing to go on but the prefix"
    );
});

test("Workflow keeps the reader on the canvas", () => {
    // The graph is the thing being read. Stepping through provenance has to
    // happen on it, or the view answers its own question by leaving.
    assert.ok(CARD_VIEWS.has("workflow"));
    assert.equal(viewForRecord("T-0154", "workflow", true), null);
});

/**
 * `View` is a type and `KNOWN_VIEWS` is a value, and nothing makes them agree.
 *
 * An unrecognised `?view=` falls back to the overview rather than failing, so
 * the whole symptom of forgetting one is that reloading on it quietly lands
 * somewhere else. `workflow` was added to the union and not to the list, and
 * that is exactly what it did.
 *
 * The assertion runs the other way too: a view in the list that the union does
 * not have is a URL the app accepts and then cannot render.
 */
test("every view a URL can name is a view the app has", async () => {
    const read = (name: string) =>
        readFile(new URL(`../ui/src/${name}`, import.meta.url), "utf8");
    // Both sides read as source rather than imported. `query.ts` imports
    // values from `./types` without an extension, which the bundler requires
    // and Node's ESM loader refuses — so importing it here is not available,
    // and a parity check that cannot run is worse than none.
    const routable = /const VIEWS: View\[\] = \[([^\]]+)\]/.exec(
        await read("query.ts")
    )?.[1];
    const union = /export type View =\s*([^;]+);/.exec(await read("types.ts"))?.[1];
    const names = (source: string | undefined) =>
        [...(source ?? "").matchAll(/"([a-z]+)"/g)].map((match) => match[1]).sort();

    const declared = names(union);
    assert.ok(declared.length > 5, "the View union was not read");
    assert.deepEqual(
        names(routable),
        declared,
        "the routable views and the View union disagree"
    );

    // And the sidebar has to offer each one, or a view is reachable only by
    // typing its URL.
    const main = await read("main.tsx");
    for (const view of declared) {
        assert.match(
            main,
            new RegExp(`value: "${view}"`),
            `${view} has no entry in the sidebar`
        );
    }
});
