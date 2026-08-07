import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
    CARD_VIEWS,
    drawerCovers,
    recordCollection,
    recordNeighbours,
    viewForRecord
} from "../ui/src/navigation.ts";
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

/**
 * T-0192: leaving a document opened an empty inspector over the list.
 *
 * `Docs` said "no document" with `onSelect("")`, `recordCollection("")` fell
 * through its prefix tests to the default `memory`, and `"docs" !== "memory"`
 * is true — so the control whose whole job is going back to the list covered
 * the list with a drawer holding nothing.
 */
test("an id that names no collection is a selection of nothing", () => {
    assert.equal(recordCollection("T-0042"), "cards");
    assert.equal(recordCollection("DOC-0002"), "docs");
    assert.equal(recordCollection("PATH-0001"), "docs");
    assert.equal(recordCollection("CHG-0110"), "changelog");
    assert.equal(recordCollection("REL-0017"), "changelog");
    // Memory keeps the fallback, so a project that configures its own memory
    // prefixes still lands somewhere that lists them.
    assert.equal(recordCollection("ADR-0016"), "memory");
    assert.equal(recordCollection("PLAYBOOK-0003"), "memory");

    for (const absent of ["", " ", "docs", "all", "T-", "-0042"]) {
        assert.equal(
            recordCollection(absent),
            null,
            `"${absent}" is not a record id and must not name a collection`
        );
    }
});

test("the drawer stands down for the view that owns the reader, and for nothing", () => {
    // The rule it is there for: docs owns its own reader, so the overlay does
    // not open over it — but every other collection still opens there.
    assert.equal(drawerCovers("docs", "docs"), false);
    assert.equal(drawerCovers("docs", "cards"), true);
    assert.equal(drawerCovers("explorer", "docs"), true);
    assert.equal(drawerCovers("explorer", "cards"), true);

    // And going back to the list from a document: no collection, no drawer.
    // This read `VIEW_OWNS_DRAWER[view] !== recordCollection(id)`, which is
    // true for a null as readily as for another view's collection.
    for (const view of ["docs", "explorer", "memory", "history"] as View[]) {
        assert.equal(
            drawerCovers(view, null),
            false,
            `${view} opened an empty drawer over itself`
        );
    }
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

// History renders its selection in a right-hand pane, and the drawer used to
// open over that pane with the same fragment in it — the reader got the text
// twice and could read neither, because the pane underneath was cut off
// mid-word. The map was reasoned about rather than looked at.
test("a view that already renders the selection is not covered by the drawer", () => {
    for (const [view, collection] of [
        ["docs", "docs"],
        ["history", "changelog"]
    ] as Array<[View, string]>) {
        assert.equal(
            drawerCovers(view, collection),
            false,
            `${view} renders ${collection} itself`
        );
    }

    // And still covers what those views cannot render. A card linked from
    // inside a fragment body has nowhere else to go.
    assert.equal(drawerCovers("history", "cards"), true);
    assert.equal(drawerCovers("history", "memory"), true);
    assert.equal(drawerCovers("docs", "changelog"), true);
    assert.equal(drawerCovers("explorer", "changelog"), true);
});

/**
 * The reading cursor, which every kind now has and only cards used to.
 *
 * `Inspector` has carried previous/next for cards since the rail became a
 * drawer. Reading three changelog fragments in a row meant dismissing the
 * reader, finding your place in the list, and clicking again — T-0207, and the
 * one finding of ADR-0017 that survived being superseded.
 */
test("the reading cursor is absent where there is no list, not guessed", () => {
    const list = ["CHG-0151", "REL-0021", "CHG-0149"];

    // No list at all: a `[[LRN-0004]]` in a card body, a `related` row, the
    // command palette, a node of the Workflow graph.
    assert.deepEqual(recordNeighbours([], "CHG-0151"), {
        previousId: null,
        nextId: null
    });
    // A record the list does not hold, which is the same thing: the reader
    // followed a link out of it.
    assert.deepEqual(recordNeighbours(list, "ADR-0018"), {
        previousId: null,
        nextId: null
    });
    // And nothing selected, which is the docs view on a wide screen before the
    // reader has picked anything: it shows the first document as a fallback,
    // and a fallback is not a place in a sequence.
    assert.deepEqual(recordNeighbours(list, null), {
        previousId: null,
        nextId: null
    });
    // A list of one has nowhere to step, so the control is absent rather than
    // present with both halves dead.
    assert.deepEqual(recordNeighbours(["CHG-0151"], "CHG-0151"), {
        previousId: null,
        nextId: null
    });
});

test("the reading cursor walks the list it was given, and stops at both ends", () => {
    const list = ["CHG-0151", "REL-0021", "CHG-0149"];

    // One end, the middle, the other end. At an end one side is null and the
    // other is not, which renders one disabled button — that is how a reader
    // tells "no next" from "there was never a sequence here".
    assert.deepEqual(recordNeighbours(list, "CHG-0151"), {
        previousId: null,
        nextId: "REL-0021"
    });
    assert.deepEqual(recordNeighbours(list, "REL-0021"), {
        previousId: "CHG-0151",
        nextId: "CHG-0149"
    });
    assert.deepEqual(recordNeighbours(list, "CHG-0149"), {
        previousId: "REL-0021",
        nextId: null
    });

    // The order is the caller's, never re-sorted here. History's rail draws
    // unpublished, then releases, then published fragments, and a cursor that
    // walked the ids in any other order would disagree with the column beside
    // it.
    assert.equal(recordNeighbours(list, "REL-0021").nextId, "CHG-0149");
});

/**
 * One control, in every panel that reads a record.
 *
 * The card inspector had its own previous/next pair inline. Copying it into the
 * memory panel, the record panel, and the readers Docs and History own would
 * have been four more chances for one of them to disagree — about where the
 * control sits, whether it disables or vanishes at the ends, or what its
 * accessible name is. So the pair moved out and each panel renders it.
 */
test("every panel that reads a record renders the same cursor", async () => {
    const read = (name: string) =>
        readFile(new URL(`../ui/src/${name}`, import.meta.url), "utf8").then(
            (source) => source.replaceAll("\r\n", "\n")
        );

    const panels = [
        "components/Inspector.tsx",
        "components/RecordPanel.tsx",
        "components/Memory.tsx",
        "components/Docs.tsx",
        "components/History.tsx"
    ];
    for (const panel of panels) {
        const source = await read(panel);
        assert.match(
            source,
            /import \{ RecordCursor \} from "\.\.\/record-cursor"/,
            `${panel} does not use the shared cursor`
        );
        assert.match(source, /<RecordCursor\b/, `${panel} renders no cursor`);
    }

    // And nobody has a second pair that looks like it. The accessible names are
    // written in exactly one file, which is the whole of "one control".
    for (const name of panels.concat(["main.tsx"])) {
        assert.doesNotMatch(
            await read(name),
            /aria-label=\{?[`"](Previous|Next) /,
            `${name} declares its own previous/next control`
        );
    }
    assert.match(
        await read("record-cursor.tsx"),
        /aria-label=\{`Previous \$\{noun\}`\}/
    );

    // The shell owns the list and hands it over once, around the whole tree:
    // the panels that render the cursor sit in three different places — the
    // drawer, the docs reader and the history pane — and a prop would have to
    // reach all three.
    const main = await read("main.tsx");
    assert.match(main, /<RecordCursorProvider/);
    assert.match(main, /ids=\{cursorIds\}/);
});
