---
id: T-0104
title: The board groups by a declared axis
status: done
type: feature
priority: low
area: ui
scope: [packages/workfile/ui/src/components/domain/Boards.tsx]
related: [T-0060]
created: 2026-08-02
updated: 2026-08-04
origin: [ADR-0008]
---

Per [[ADR-0008]]. The reporter's stated payoff was reading the board by domain,
and a field nothing renders buys nothing — this is the card that makes the axis
worth declaring rather than merely correct.

Group-by should offer the declared axes alongside status and area, from
`workfile schema` rather than a hardcoded list, so a project that declares two
axes gets both without a UI change.

Depends on the axes being declared and validated first, so the values a
grouping renders are known to be a closed set.

## Acceptance criteria

- [x] The board can group by any axis the workspace declares
- [x] The grouping options come from the runtime schema, not a list in the UI
- [x] A card with no value for the grouping axis lands in a visible bucket

## Activity

- 2026-08-02 18:40Z illodev@local#aed59c5e · claimed
- 2026-08-02 18:51Z illodev@local#aed59c5e · doing → done
- 2026-08-02 18:53Z illodev@local#aed59c5e · claimed
- 2026-08-02 18:53Z illodev@local#aed59c5e · released

## Notes

- 2026-08-02 18:51Z illodev@local#aed59c5e — Done in the timeline, which is where the board's only group control lives —
worth saying plainly, because the card says "the board" and the kanban is not
it. `FlowBoard`'s columns are statuses by construction; the one group-by in the
interface is `TimelineView`'s, and adding axes there is what the card body
describes ("alongside status and area, from `workfile schema`").

Nothing was needed below the interface, which was the surprise. Measured before
building:

    schema.cards.axes: {"context":["treasury","billing"]}
    T-0001 {"title":"Con eje","area":"general","context":"treasury"}
    T-0002 {"title":"Sin eje","area":"general"}

The vocabulary already reaches the browser through `/api/v2/workspace`, and
axis values already ride along on each card as flat keys. The UI's
`RuntimeSchema` type simply did not declare `axes`, so the data was arriving
and being ignored.

Verified in Chromium against a live server, on a workspace declaring
`context: [treasury, billing]` with four dated cards, one of them untagged:

    opciones del selector: ["none","epic","area","context"]
    cubos visibles:        ["BILLING","TREASURY","NO CONTEXT"]

The empty bucket sorts last on purpose: sorting it under "" put it first, where
it read as the leading group.

One thing the measurement caught that review would not have. The dependency
overlay maps one row to one viewBox unit, so header rows have to occupy a slot
— and mine were a pixel short, because `border-box` sizing puts the border
inside an explicit height while a card row adds it outside. Three headers is
three pixels of drift on the arrows. Measured in the DOM rather than eyeballed:

    antes:   agrupado {"viewBoxRows":7,"domRows":7,"uniqueHeights":[40,41]}
    despues: agrupado {"viewBoxRows":7,"domRows":7,"uniqueHeights":[41]}
             sin agrupar {"viewBoxRows":4,"domRows":4,"uniqueHeights":[41]}

Found on the way, and it makes this feature more fragile than it looks:
[[T-0128]]. `projectRecord` narrows records to a frozen allowlist, and a
per-project key cannot be on a frozen allowlist — so every view except `full`
drops declared axes. The board works only because the listing asks for `full`,
and the comment above that function says listings ask for `summary`. Added
"a declared axis survives the round trip back out" to axes.test.ts as the
tripwire: writing an axis was covered from four surfaces, reading one back was
covered from none.

233 + 7 tests pass, strict holds at baseline, the UI typechecks and builds.
- 2026-08-02 18:53Z illodev@local#aed59c5e — Two caveats from a review that finished after this closed, recorded because
the third criterion is checked and one of them qualifies what that means.

"A card with no value lands in a visible bucket" is satisfied among the cards
this surface shows, which is not all of them. `TimelineView` filters to
`task.start || task.due` before grouping runs, so a card with no dates is
absent whatever the grouping — and that is true of every card without dates,
axis or no axis. The criterion is about the grouping not swallowing anything,
and it does not; it is not a claim that the timeline shows the whole corpus.
Read as "every card with no axis value is visible somewhere", this surface
structurally cannot deliver it, and the place that could is the kanban, which
excludes nothing and has no grouping at all.

The review also caught a real one the criteria do not cover: the grouping is
component state and the view is lazy-loaded, so navigating away and back resets
it to `none`. It predates this work — the control never persisted anything —
but it matters more now that the reading somebody sets up is their own domain
axis. Carded as [[T-0129]] rather than folded in here, because where it belongs
is a decision: `localStorage` makes it personal, the URL makes it shareable,
and the existing filters already live in the URL.

One risk the review flagged that this had already avoided: with the previous
code the unset bucket sorted as the literal string "ungrouped", which against a
vocabulary like treasury/verifactu/billing/iam lands between "treasury" and
"verifactu" — unset cards interleaved into the middle of the chart rather than
collected anywhere. The empty bucket is now sorted last explicitly, and the
browser run confirms it: BILLING, TREASURY, NO CONTEXT.
