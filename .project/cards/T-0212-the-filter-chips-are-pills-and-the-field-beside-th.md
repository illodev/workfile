---
id: T-0212
title: The filter chips are pills and the field beside them is not
status: review
type: bug
priority: low
area: ui
tags: [design-system]
effort: S
scope: [packages/workfile/ui/src/components]
origin: [T-0194]
created: 2026-08-05
updated: 2026-08-05
---

Reported by the owner. Measured: the search field computes `border-radius: 8px`
and a filter chip computes a full pill, in every view that renders both. They sit
next to each other in the same bar and disagree about what shape a control is.

The question the card has to answer is not which of the two is right for the
filter bar — it is which radii this design system has, and which control wears
which. Answering it locally would put a third value in the same file as the two
that already disagree.

Worth doing next to T-0194's control-size ladder rather than instead of it: that
card established rungs for height and named a default, and radius is the same
kind of fact about the same controls. A token per rung, read by the primitives,
is the shape that keeps the next control from picking its own.

## Acceptance criteria

- [x] The radii a control may have are declared in one place, as the sizes now are.
- [x] A field and a chip that sit in the same bar agree, and the reason they agree is written down rather than being a coincidence of two class lists.
- [x] Nothing outside the filter bars changes shape without that being a deliberate part of the change.
- [x] Checked in the running app, not only in the tokens.

## Notes

- 2026-08-05 23:27Z illodev@local#bf4c5f67 — Fixed. The chips carried an explicit rounded-full next to a field at 8px. Rather than pick a third number, the override is gone: the chips now take the button primitive's own rounded-md, which resolves to --radius-md, which is exactly what the field uses. Measured in explorer, flow, triage and memory: field 8px, chip 8px in all four.

## Activity

- 2026-08-05 23:27Z illodev@local#bf4c5f67 · backlog → review
