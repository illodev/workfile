---
id: T-0065
title: "Reading views have no measure: Triage and Docs run edge to edge"
status: backlog
type: bug
priority: medium
area: ui
tags: [ui-polish, typography]
scope: [packages/workfile/ui/src/components/Triage.tsx, packages/workfile/ui/src/components/Docs.tsx, packages/workfile/ui/src/components/Memory.tsx]
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
