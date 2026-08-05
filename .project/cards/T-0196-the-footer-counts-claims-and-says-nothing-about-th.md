---
id: T-0196
title: The footer counts claims and says nothing about them
status: review
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

- [x] The claim area opens a popover listing every active claim with card, actor, scope and age.
- [x] A claim past the staleness threshold is visually distinct.
- [x] Overlapping scopes are called out rather than left for the reader to spot.
- [x] Selecting a claim opens its card.

## Notes

- 2026-08-05 20:31Z illodev@local#bf4c5f67 — Verified in a real browser, twice. Against this workspace: the footer's claim area opens a popover listing each claim with card, actor, scope and state, and selecting a row opens the card. Against a fabricated workspace carrying the states this one does not — a claim held six hours, one untouched three days, two actors whose scopes overlap — all three are listed with the state the server computed, stale renders var(--sev-warning) against held's var(--status-review) so they differ by more than the word, the overlap is called out by name with the shared path, and the most urgent claim leads the list. That last one is the agent's own addition: the strip and the popover must not be two differently sorted lists of the same claims, so Overview's verdict ladder now picks the same card the ledger puts first.

## Activity

- 2026-08-05 20:31Z illodev@local#bf4c5f67 · backlog → review
