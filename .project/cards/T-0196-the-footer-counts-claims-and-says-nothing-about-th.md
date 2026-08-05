---
id: T-0196
title: The footer counts claims and says nothing about them
status: backlog
type: feature
priority: low
area: ui
effort: S
created: 2026-08-05
updated: 2026-08-05
---

The footer's claim area reports that claims exist. With more than one, the useful
questions — which cards, which actor, which scopes, how stale — need a view
change to answer, and staleness is exactly what the reader wants at a glance: the
protocol calls a claim operationally stale after 24 hours.

A popover on the claim area, listing each claim with its card, actor, scope and
age, and opening the card on click. `components/ui/popover.tsx` already exists.

Scope conflicts are already computed in `main.tsx` (`scopeConflicts`, rendered at
`main.tsx:1554`) and are the highest-value thing to surface here — an overlapping
scope is the one claim state that needs acting on rather than noting.

## Acceptance criteria

- [ ] The claim area opens a popover listing every active claim with card, actor, scope and age.
- [ ] A claim past the staleness threshold is visually distinct.
- [ ] Overlapping scopes are called out rather than left for the reader to spot.
- [ ] Selecting a claim opens its card.
