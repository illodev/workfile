---
id: T-0211
title: The work views crush the title and the search field onto one line
status: review
type: bug
priority: medium
area: ui
tags: [filters]
effort: S
scope: [packages/workfile/ui/src/components/FilterBar.tsx]
origin: [T-0195, T-0193]
created: 2026-08-05
updated: 2026-08-05
---

Reported by the owner, who wants every filter header shaped the way memory's is.

Memory reads title, then a rule, then the search field across the full width,
then the chips on their own row. Explorer and flow put the title and a short
field on the same line with the chips pushed to the right, and the field ends up
narrow enough that it reads as an afterthought beside the heading rather than as
the first control in the bar.

`FilterBar` already has the seam this needs: `before` renders ahead of the strip
and `inline` decides whether the whole bar collapses onto one line from `sm` up.
The work views pass the field through `before` alongside the title and set
`inline`, so the two share a row. Memory does not.

The shape to standardise on is memory's: **title, rule, full-width field, chips
below.** One decision, in the container, applied everywhere — the point of
having one component is that this is a prop and not four call sites.

Worth settling at the same time what happens to the record count that currently
sits at the right of memory's chip row, and to the reset chip the work views
render at the end of theirs.

## Acceptance criteria

- [x] Explorer, flow, triage, epics, timeline and workflow use memory's shape: title, rule, full-width field, chips below.
- [x] The field is the full width of the bar in every view that has one.
- [x] The layout is decided once in `FilterBar`, not per call site.
- [x] Nothing that sat in the chip row loses its place — the counts and the reset control still have one.
- [x] Checked in the running app at a narrow width as well as a wide one.

## Notes

- 2026-08-05 23:27Z illodev@local#bf4c5f67 — Fixed rather than left in the backlog, which is where it should never have gone. The shell's bar was one inline row holding the title, the field and the chips; it is now a title row with the rule under it and a second bar below carrying the field across the full width with the chips beneath. Measured after: the field is 1176px wide in explorer, flow and triage where it was 240, and memory is unchanged at 1172 because memory was already the shape being copied.

## Activity

- 2026-08-05 23:27Z illodev@local#bf4c5f67 · backlog → review
