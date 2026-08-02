import assert from "node:assert/strict";
import test from "node:test";

import {
    activitySpan,
    axisFor,
    planSpan,
    preferredMode,
    type Span
} from "../ui/src/timeline.ts";
import { createTestWorkspace } from "./support/workspace.ts";

import {
    appendCardNote,
    claimCard,
    loadCards,
    transitionCard
} from "../dist/src/index.js";

const HOUR = 3_600_000;
const DAY = 86_400_000;

const at = (iso: string) => Date.parse(iso);

/** A card as the UI receives it: only the fields the chart reads. */
const dated = (start?: string, due?: string) => ({ start, due });

async function bodyOf(workspace: unknown, id: string) {
    const loaded = await loadCards(workspace);
    const found = loaded.cards.find(
        (card: { id: string }) => card.id === id
    ) as { body?: string } | undefined;
    assert.ok(found, `${id} should still exist`);
    assert.equal(typeof found.body, "string", "the card should carry a body");
    return found.body as string;
}

/**
 * The seam this pins: `activityEntry` composes the trail line in
 * `mutations.ts` and the chart parses it back in the browser, and nothing in
 * between typechecks the two against each other. A change to the stamp format
 * would leave the parser matching nothing — which is not an error, it is an
 * empty chart, on a view whose whole complaint was being empty.
 */
test("the chart reads back the trail the protocol writes", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-timeline-"
    });
    try {
        await claimCard(workspace, "T-0001", {
            actor: "agent:test",
            now: at("2026-07-30T12:35:00Z")
        });
        await transitionCard(workspace, "T-0001", "review", {
            actor: "agent:test",
            now: at("2026-07-30T14:05:00Z")
        });
        const span = activitySpan(await bodyOf(workspace, "T-0001"));
        assert.ok(span, "a card claimed and moved has a recorded stretch");
        assert.equal(span.from, at("2026-07-30T12:35:00Z"));
        assert.equal(span.to, at("2026-07-30T14:05:00Z"));
        assert.equal(span.point, false);
    } finally {
        await cleanup();
    }
});

/**
 * `## Notes` lines carry the same leading stamp as trail entries, so a body
 * read whole would count a note written a week later as work still in flight.
 */
test("a note written afterwards does not stretch the work", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-timeline-"
    });
    try {
        await claimCard(workspace, "T-0001", {
            actor: "agent:test",
            now: at("2026-07-30T12:35:00Z")
        });
        await transitionCard(workspace, "T-0001", "review", {
            actor: "agent:test",
            now: at("2026-07-30T14:05:00Z")
        });
        await appendCardNote(workspace, "T-0001", {
            actor: "agent:test",
            text: "Read again a week later.",
            now: at("2026-08-06T09:00:00Z")
        });
        const span = activitySpan(await bodyOf(workspace, "T-0001"));
        assert.ok(span);
        assert.equal(
            span.to,
            at("2026-07-30T14:05:00Z"),
            "the note is commentary, not a milestone"
        );
    } finally {
        await cleanup();
    }
});

test("a card with no trail places nothing", () => {
    assert.equal(activitySpan(undefined), null);
    assert.equal(activitySpan("Body with no sections."), null);
    assert.equal(
        activitySpan("## Notes\n\n- 2026-07-30 12:35Z agent — a note\n"),
        null,
        "notes alone are not a recorded stretch"
    );
});

test("a trail recorded inside one minute is a point, not a bar", () => {
    const span = activitySpan(
        "## Activity\n\n- 2026-07-30 12:35Z agent · claimed\n" +
            "- 2026-07-30 12:35Z agent · doing → done\n"
    );
    assert.deepEqual(span, {
        from: at("2026-07-30T12:35:00Z"),
        to: at("2026-07-30T12:35:00Z"),
        point: true
    });
});

test("a due date is worked through its own day", () => {
    const span = planSpan(dated("2026-07-30", "2026-08-04"));
    assert.ok(span);
    assert.equal(span.from, at("2026-07-30T00:00:00Z"));
    assert.equal(
        span.to,
        at("2026-08-05T00:00:00Z"),
        "a card due on the 4th is worked through the 4th"
    );
    assert.equal(planSpan(dated()), null);
    assert.equal(planSpan(dated("2026-07-30"))?.point, true);
    assert.equal(planSpan(dated(undefined, "2026-07-30"))?.point, true);
});

test("the mode opens on whatever the workspace has", () => {
    const planned = [
        { start: "2026-07-30" },
        { body: "## Activity\n\n- 2026-07-30 12:35Z a · claimed\n" }
    ];
    assert.equal(preferredMode(planned), "plan");
    assert.equal(preferredMode(planned.slice(1)), "actual");
    assert.equal(
        preferredMode([{}]),
        "plan",
        "with nothing to draw, the empty state should name the field"
    );
});

/**
 * A fixed month scale was fine while `start`/`due` were the only source. The
 * trail spans hours, and four days of it against one "Aug" gridline says
 * nothing about when anything happened.
 */
test("the scale follows the span it has to cover", () => {
    const span = (from: number, to: number): Span => ({
        from,
        to,
        point: false
    });
    const hours = axisFor(
        [span(at("2026-07-30T09:10:00Z"), at("2026-07-30T17:40:00Z"))],
        at("2026-07-30T12:00:00Z")
    );
    assert.ok(hours);
    assert.ok(
        hours.ticks.some((tick) => /^\d\d:\d\d$/.test(tick.label)),
        `expected hour labels, got ${hours.ticks.map((t) => t.label).join(", ")}`
    );

    const days = axisFor(
        [span(at("2026-07-30T09:00:00Z"), at("2026-08-02T18:00:00Z"))],
        0
    );
    assert.ok(days);
    assert.deepEqual(
        days.ticks.map((tick) => tick.label),
        ["Jul 30, 2026", "Jul 31", "Aug 1", "Aug 2"],
        "four days of work should be four gridlines"
    );

    const months = axisFor(
        [span(at("2026-03-02T00:00:00Z"), at("2026-06-20T00:00:00Z"))],
        0
    );
    assert.ok(months);
    assert.deepEqual(
        months.ticks.map((tick) => tick.label),
        ["Mar 2026", "Apr", "May", "Jun"]
    );
});

test("a single moment still produces a scale to draw on", () => {
    const moment = at("2026-07-30T12:00:00Z");
    const axis = axisFor([{ from: moment, to: moment, point: true }], moment);
    assert.ok(axis);
    assert.ok(axis.end > axis.start, "a zero-width scale divides by zero");
    assert.ok(
        Number.isFinite(axis.pct(moment)),
        "every bar would render NaN otherwise"
    );
    assert.equal(axis.today, axis.pct(moment));
});

test("the now marker stays off a chart that does not reach it", () => {
    const axis = axisFor(
        [
            {
                from: at("2026-07-30T00:00:00Z"),
                to: at("2026-07-31T00:00:00Z"),
                point: false
            }
        ],
        at("2027-01-01T00:00:00Z")
    );
    assert.ok(axis);
    assert.equal(axis.today, null);
    assert.equal(axis.pct(axis.start), 0);
    assert.equal(axis.pct(axis.end), 100);
    assert.ok(axis.end - axis.start >= DAY);
    assert.ok(axis.ticks[1].key - axis.ticks[0].key <= 6 * HOUR);
});
