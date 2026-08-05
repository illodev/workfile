---
id: T-0194
title: Control sizes are inconsistent and too large for the density the app targets
status: done
type: bug
priority: medium
area: ui
effort: M
created: 2026-08-05
updated: 2026-08-05
related: [T-0193]
verified:
  at: "2026-08-05T23:50:18.334Z"
  method: local
  commit: 434317ee8b3ab53824bc319fcf210df6ce36c2ac
  digest: "sha256:1657b526acfb3a3c4be62910e699120e1294dc6921fdb08e59e863197307da0c"
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

- [x] The default button size is the smaller one, and deliberate exceptions are explicit.
- [x] An input and a button of the same declared size have the same height, in every toolbar that mixes them.
- [x] The Triage header fits a narrow viewport without overflow or clipping.
- [x] The change is reviewed in the running app across the affected views, not only in the diff.

## Notes

- 2026-08-05 22:47Z illodev@local#bf4c5f67 — Retyped bug. It bundles two reported defects — the Triage header not responding well at narrow widths, and the memory search input sitting taller than the buttons beside it — with one preference, smaller buttons across the app. Filing the bundle as a task let the preference set the type, which buried the two defects inside it. The preference is the cheapest fix for both, so the bundling stands; the label was wrong.
- 2026-08-05 22:54Z illodev@local#bf4c5f67 — Criterion 4 was mine and is done: explorer, triage, memory, docs, history and workflow at 420, 820 and 1440. Triage at 420 fits on one row (Previous, 1/29, Next, and an icon for Open full card) with nothing past the viewport and no page-level horizontal scroll; at 1440 every label is back with its keyboard hint. Field and buttons that share a row in explorer measure 28px each — my first measurement said 26 against 28 and was wrong, because I measured the inner input rather than the InputGroup, which is what a reader sees. In docs, history and memory the field owns its own row, so nothing mixes there to misalign.
- 2026-08-05 23:50Z illodev@local#bf4c5f67 — local verification: Built UI, measured with Playwright: the search field and every chip beside it report a 28px box in all nine views with a bar (explorer, flow, triage, epics, timeline, workflow, memory, docs, history). Triage at 390x780: document scrollWidth 390 against clientWidth 390, no overflow, screenshot reviewed.

## Activity

- 2026-08-05 23:09Z illodev@local#bf4c5f67 · backlog → review
- 2026-08-05 23:50Z illodev@local#bf4c5f67 · review → done
