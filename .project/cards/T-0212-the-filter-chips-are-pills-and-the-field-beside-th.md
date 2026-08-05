---
id: T-0212
title: The filter chips are pills and the field beside them is not
status: backlog
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

- [ ] The radii a control may have are declared in one place, as the sizes now are.
- [ ] A field and a chip that sit in the same bar agree, and the reason they agree is written down rather than being a coincidence of two class lists.
- [ ] Nothing outside the filter bars changes shape without that being a deliberate part of the change.
- [ ] Checked in the running app, not only in the tokens.
