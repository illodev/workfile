---
id: T-0068
title: Overview rows and the board views still overflow on a phone
status: done
type: bug
priority: medium
area: ui
tags: [ui-polish, responsive]
scope: [packages/workfile/ui/src/components/domain]
created: 2026-07-31
updated: 2026-07-31
---

[[T-0066]] and [[T-0067]] covered the shell and the four views they named. The
remaining surfaces were left out of that pass deliberately, and they still
assume a desktop viewport.

Captured at 390 after that work landed:

- **Overview** — the "what is left" rows put id, title and a trailing meta strip
  on one line. The strip runs past the edge: "never claime" is cut mid-word. The
  trail table below does the same. The tiles above are fine; they were fixed
  with the accent work.
- **Explorer** — an eight-column table at desktop geometry.
- **Flow / Epics / Timeline** — fixed 268px columns in a horizontal scroller.
  The scroller behaves, but the toolbars above it do not.

## Scope

The boards are the easy half: they already scroll horizontally, which is the
behaviour chosen for Memory, so they mostly need their toolbars to wrap.

Explorer is the one with no obvious answer. A table is a desktop form, and
turning eight columns into cards at 390 is a different view rather than a
narrower one — worth deciding before building. The `--card-density` work and
`useIsMobile` are both already available for it.

## Activity

- 2026-07-31 22:24Z session-fube-triage · claimed
- 2026-07-31 22:43Z session-fube-triage · doing → done
- 2026-07-31 22:43Z session-fube-triage · released

## Decisions

- 2026-07-31 22:39Z session-fube-triage — Explorer keeps its table and gains a facet sheet. The open question on this card was whether eight columns at 390 should become cards; they should not. Sorting, selection, inline patching and the windowing all measure one grid, and a card-shaped second implementation of them is a second set of bugs to keep in step. Measured, the rail was the actual problem: 204px of facets against a table whose natural width is 990px left about 180px for nine columns, so the facets were not narrow, they were taking the view. Below `lg` they move behind a sheet — the same facet component mounted twice, not a second one — and the grid scrolls sideways, which is the answer already chosen for Flow and for Memory. The rail returns pinned at 1024, unchanged.

## Verification

- 2026-07-31 22:39Z session-fube-triage — Done for Overview and Explorer; the boards needed nothing, which contradicts this card. Runtime at 390 in a Chromium viewport over the built UI: Overview's backlog rows now give the title the full width and drop the meta strip to a second line indented past the dot and the id, so 'never claimed' is readable rather than clipped; the trail's five fixed columns (44+52+178+186 plus gaps, against 350px of usable width) re-cut into when / then who and what, with the sentence hanging under the time column. Explorer at 390 measures a 990px grid inside a 390px scrollport: opening the sheet, picking 'blocked' and closing it filtered the grid to 2 rows, and scrolling right reached prio, type, area, links and updated. At 1024 both views are pixel-identical to before. A DOM sweep for boxes crossing the viewport edge with no scrolling ancestor reports none on overview, explorer, flow, epics or timeline at 390, 768 and 1024. `pnpm check` green: 181 + 7 tests, strictNullChecks 647 known, none new.

The card's third bullet was wrong. Flow, Epics and Timeline were captured at 390 and 768 before any change: the filter chips already wrap onto two rows, Flow's columns already scroll, Epics already stacks, and Timeline keeps its card column beside a scrolling chart. Nothing was changed there, and the bullet is corrected here rather than acted on.
