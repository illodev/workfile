import assert from "node:assert/strict";
import test from "node:test";

import { railDepth, type OutlineEntry } from "../ui/src/outline.ts";

const outline = (levels: number[]): OutlineEntry[] =>
    levels.map((level, index) => ({
        id: `h-${index}`,
        text: `Heading ${index}`,
        level
    }));

test("a rail that fits shows every heading it has", () => {
    const entries = outline([1, 2, 2, 3, 2, 1]);
    assert.equal(railDepth(entries), 3);
});

test("a long document degrades to its chapters, not to its first forty lines", () => {
    // 172 headings is what this repository's longest record actually carries.
    // At six pixels a tick that is 870px of rail — taller than the drawer, so
    // without this the bottom two thirds of the document's shape would simply
    // run off the end with nothing to show it had.
    const entries = outline([
        ...Array.from({ length: 8 }, () => 1),
        ...Array.from({ length: 164 }, () => 3)
    ]);
    const depth = railDepth(entries);
    // Level 2, not level 1: dropping the third level already brings it to
    // eight ticks, and the rule keeps as much depth as fits rather than as
    // little as it can get away with.
    assert.equal(depth, 2);
    assert.ok(
        entries.filter((entry) => entry.level <= depth).length <= 40,
        "the rail still exceeds its budget"
    );
});

test("depth is dropped from the bottom up", () => {
    // 10 top-level and 35 second-level fit at depth 2 (45 > 40 does not), so
    // the answer is 1 — and the point is that it is the *deepest* levels that
    // go, never a prefix of the document.
    const entries = outline([
        ...Array.from({ length: 10 }, () => 1),
        ...Array.from({ length: 35 }, () => 2)
    ]);
    assert.equal(railDepth(entries), 1);

    // Widen the budget and the second level comes back rather than more of
    // the first, which is already whole.
    assert.equal(railDepth(entries, 50), 2);
});

test("a rail never drops below the top level, however deep the document", () => {
    const entries = outline(Array.from({ length: 500 }, () => 1));
    assert.equal(
        railDepth(entries),
        1,
        "there is no depth below 1 to fall back to, and returning 0 draws nothing"
    );
});
