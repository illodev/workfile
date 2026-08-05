import assert from "node:assert/strict";
import test from "node:test";

import {
    activeClaims,
    claimRank,
    orderClaims,
    overlapsByCard,
    type ClaimOverlap
} from "../ui/src/claims.ts";
import type { ActivitySnapshot, ClaimEntry } from "../ui/src/types.ts";

/**
 * The footer's claim ledger, minus the drawing.
 *
 * Nothing in this package can render a component, so what is provable here is
 * the part that decides what the popover says: which conflicts belong to which
 * row, and which claim the reader sees first. The rest — that the popover
 * opens, that a row opens its card — is checked by hand in the browser.
 */

const claim = (
    id: string,
    state: ClaimEntry["claim"]["state"],
    ageHours: number | null = 1,
    by = "agent-a"
): ClaimEntry => ({
    id,
    title: `Card ${id}`,
    status: "doing",
    scope: [],
    claim: { by, at: null, ageHours, state, sessionId: null }
});

const conflicts = (
    ...rows: Array<{ cards: string[]; paths: string[] }>
): ActivitySnapshot["conflicts"] => rows;

const others = (overlaps: ClaimOverlap[] | undefined) =>
    (overlaps ?? []).map((row) => row.other);

test("a conflict is indexed from both of the cards it names", () => {
    // The server emits an unordered pair, which is the right shape for a count
    // and the wrong one for a row: a row knows its own id and needs the other.
    const byCard = overlapsByCard(
        conflicts({ cards: ["T-0001", "T-0002"], paths: ["ui/src"] })
    );
    assert.deepEqual(byCard.get("T-0001"), [
        { other: "T-0002", paths: ["ui/src"] }
    ]);
    assert.deepEqual(byCard.get("T-0002"), [
        { other: "T-0001", paths: ["ui/src"] }
    ]);
});

test("two conflicts on the same card merge instead of replacing each other", () => {
    const byCard = overlapsByCard(
        conflicts(
            { cards: ["T-0001", "T-0002"], paths: ["ui/src"] },
            { cards: ["T-0001", "T-0003"], paths: ["src/server"] }
        )
    );
    assert.deepEqual(others(byCard.get("T-0001")), ["T-0002", "T-0003"]);
    assert.deepEqual(others(byCard.get("T-0002")), ["T-0001"]);
    assert.deepEqual(others(byCard.get("T-0003")), ["T-0001"]);
});

test("the same pair twice unions its paths, deduplicated and sorted", () => {
    const byCard = overlapsByCard(
        conflicts(
            { cards: ["T-0001", "T-0002"], paths: ["ui/src", "docs"] },
            { cards: ["T-0001", "T-0002"], paths: ["docs", "bin"] }
        )
    );
    assert.deepEqual(byCard.get("T-0001"), [
        { other: "T-0002", paths: ["bin", "docs", "ui/src"] }
    ]);
});

test("a conflict that is not a pair indexes nothing rather than throwing", () => {
    assert.equal(overlapsByCard([]).size, 0);
    // One id has no other side; the same id twice is not a collision with
    // anybody, and a row warning that it overlaps itself is worse than silence.
    const byCard = overlapsByCard(
        conflicts(
            { cards: ["T-0001"], paths: ["ui/src"] },
            { cards: ["T-0002", "T-0002"], paths: ["ui/src"] }
        )
    );
    assert.equal(byCard.size, 0);
});

test("only unclaimed is kept out of the ledger", () => {
    // `claimState()` answers `unclaimed` for a card with no holder, and the
    // snapshot filters those out before the wire — but the type still permits
    // one, and a row for a claim nobody holds is a row about nothing.
    const kept = activeClaims([
        claim("T-0001", "live"),
        claim("T-0002", "held"),
        claim("T-0003", "stale"),
        claim("T-0004", "orphaned"),
        claim("T-0005", "unclaimed")
    ]);
    assert.deepEqual(
        kept.map((entry) => entry.id),
        ["T-0001", "T-0002", "T-0003", "T-0004"]
    );
});

test("the ladder is the Overview's, restated", () => {
    // Overview's verdict sentence ranks a hanging claim above a scope
    // collision and a collision above ordinary work. Two surfaces reading the
    // same snapshot and ordering it differently is how a reader learns to
    // trust neither, so the table is pinned rather than inferred.
    assert.equal(claimRank("orphaned", false), 0);
    assert.equal(claimRank("stale", false), 1);
    assert.equal(claimRank("live", true), 2);
    assert.equal(claimRank("held", true), 2);
    assert.equal(claimRank("held", false), 3);
    assert.equal(claimRank("live", false), 4);
    assert.equal(claimRank("something-new", false), 5);
    // A hanging claim outranks a collision whichever way round they arrive.
    assert.ok(claimRank("stale", false) < claimRank("live", true));
    assert.ok(claimRank("orphaned", true) < claimRank("stale", true));
});

test("with nothing colliding, the worst claim state comes first", () => {
    const ordered = orderClaims(
        [
            claim("T-0001", "live"),
            claim("T-0002", "held"),
            claim("T-0003", "stale"),
            claim("T-0004", "orphaned")
        ],
        new Map()
    );
    assert.deepEqual(
        ordered.map((entry) => entry.id),
        ["T-0004", "T-0003", "T-0002", "T-0001"]
    );
});

test("a collision lifts a claim above the merely open ones", () => {
    const overlaps = overlapsByCard(
        conflicts({ cards: ["T-0001", "T-0009"], paths: ["ui/src"] })
    );
    const ordered = orderClaims(
        [
            claim("T-0002", "held"),
            claim("T-0001", "live"),
            claim("T-0003", "stale")
        ],
        overlaps
    );
    // The stale hold still leads: it is the one the protocol has an opinion
    // about. The colliding live claim comes next, ahead of the quiet hold.
    assert.deepEqual(
        ordered.map((entry) => entry.id),
        ["T-0003", "T-0001", "T-0002"]
    );
});

test("claims in one state order by how long they have been held, then by id", () => {
    const ordered = orderClaims(
        [
            claim("T-0002", "held", 3),
            claim("T-0004", "held", null),
            claim("T-0003", "held", 40),
            claim("T-0001", "held", 3)
        ],
        new Map()
    );
    // Oldest first, ids breaking the tie, and the claim whose timestamp did
    // not parse last — it has no age, and guessing one puts it at the top of
    // a list that is sorted by urgency.
    assert.deepEqual(
        ordered.map((entry) => entry.id),
        ["T-0003", "T-0001", "T-0002", "T-0004"]
    );
});

test("ordering does not sort the snapshot in place", () => {
    // `activity.claims` is React state, and the popover reorders it on every
    // change the workspace publishes.
    const input = [claim("T-0001", "live"), claim("T-0002", "orphaned")];
    const ordered = orderClaims(input, new Map());
    assert.notEqual(ordered, input);
    assert.deepEqual(
        input.map((entry) => entry.id),
        ["T-0001", "T-0002"]
    );
    assert.deepEqual(
        ordered.map((entry) => entry.id),
        ["T-0002", "T-0001"]
    );
});
