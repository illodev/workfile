---
id: ADR-0001
title: The UI implements the bespoke design spec in design/redesign.dc.html
status: accepted
created: 2026-07-30
updated: 2026-07-30
---
## Context

The interface was rebuilt twice on shadcn/ui, correctly both times, and rejected both times: the disagreement was with the framework's look, not with how it was applied. The owner then designed the interface they actually want in Claude Design.

## Decision

`design/redesign.dc.html` is the normative spec for the UI: tokens, layout, typography and every screen. The presentation layer is one plain stylesheet (`ui/src/styles.css`) carrying the spec's oklch tokens (light and dark via `data-theme`) and its component classes. No CSS framework. Radix primitives only where behaviour needs them. Components name tokens, never colours — enforced by `test/design-system.test.mjs`.

## Consequences

A look change is an edit to named tokens in one file. Adopting any future design system means adopting its look wholesale — coexistence layers that preserve the old appearance are how the previous two migrations failed.
