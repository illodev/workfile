---
id: T-0065
title: "Reading views have no measure: Triage and Docs run edge to edge"
status: done
type: bug
priority: medium
area: ui
tags: [ui-polish, typography]
scope: [packages/workfile/ui/src/components/Triage.tsx, packages/workfile/ui/src/components/Docs.tsx, packages/workfile/ui/src/components/Memory.tsx, packages/workfile/ui/src/layout.ts]
created: 2026-07-31
updated: 2026-07-31
---

Three views set prose against the full width of the pane, which on a 1440
viewport is a line far past what anyone reads comfortably.

- **Triage** pins its card to the left of a very wide column, so the eye
  crosses dead space between the title and the actions. It should be centred.
- **Docs** renders the document body across the whole reading pane with no
  `max-width`.
- **Memory** sets the record detail at a size that reads as oversized next to
  every other view.

## Scope

A shared reading measure rather than three different numbers, applied where a
view is prose and not a board. Boards, tables and the explorer keep the full
width — the measure is for reading, not for layout.

## Activity

- 2026-07-31 22:00Z session-ui-polish · claimed
- 2026-07-31 22:01Z session-ui-polish · doing → done

## Verification

- 2026-07-31 22:00Z session-ui-polish — One measure in a new ui/src/layout.ts — `READING_MEASURE`, 72ch and centred — used by Triage and Docs. Chose `ch` over pixels because the constraint is characters per line and the app ships its own typeface, so a pixel width would mean a different number of words at every size; 70ch was already the number Docs used for its relation list, so this follows precedent rather than inventing one. Triage kept its own 820px and no centring; it now shares the measure. Docs got the measure on an inner wrapper rather than on the scroller, so the scrollbar stays at the pane edge. Memory's oversize was a different fault, measured not guessed: `.typeset` declares `--typeset-size: 1em` on itself and the document root is 16px, while the app draws its own text at 14 and below — so the record body rendered larger than everything around it. Since the variable is declared on `.typeset`, a wrapper cannot override it by inheritance; MarkdownBody took a `className` so the call site can set it on the element itself. Runtime: screenshots at 1440 of all three.
