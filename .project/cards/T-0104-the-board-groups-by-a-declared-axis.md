---
id: T-0104
title: The board groups by a declared axis
status: done
type: feature
priority: low
area: ui
scope: [packages/workfile/ui/src/components/domain/Boards.tsx, packages/workfile/ui/src/types.ts, packages/workfile/ui/src/main.tsx]
related: [T-0060]
created: 2026-08-02
updated: 2026-08-02
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
