---
id: T-0194
title: Control sizes are inconsistent and too large for the density the app targets
status: backlog
type: task
priority: medium
area: ui
effort: M
created: 2026-08-05
updated: 2026-08-05
related: [T-0193]
---

Three reports with one root: the Triage header (Previous, Next, Open full card)
breaks badly on narrow widths because the buttons are too wide to begin with; the
Memory search input is visibly taller than the filter buttons beside it; and the
buttons are generally larger than a record tool needs.

The lever is cheap. 84 `<Button>` uses carry no `size` prop and take the default;
56 set one explicitly. Changing the default in the `cva` variants in
`packages/workfile/ui/src/components/ui/button.tsx` moves all 84 at once, after
which the few that should stay large — the primary header action — get an
explicit size back.

The input/button mismatch is the same problem seen from the other side: the input
and button scales have to agree at each size, or every toolbar that mixes them
sits crooked. Worth fixing in the primitives rather than per view.

## Acceptance criteria

- [ ] The default button size is the smaller one, and deliberate exceptions are explicit.
- [ ] An input and a button of the same declared size have the same height, in every toolbar that mixes them.
- [ ] The Triage header fits a narrow viewport without overflow or clipping.
- [ ] The change is reviewed in the running app across the affected views, not only in the diff.
