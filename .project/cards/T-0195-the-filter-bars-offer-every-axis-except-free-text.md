---
id: T-0195
title: The filter bars offer every axis except free text
status: backlog
type: feature
priority: medium
area: ui
effort: S
created: 2026-08-05
updated: 2026-08-05
---

The work views filter by status, area, type, priority and milestone, and
`filters.search` exists in `main.tsx` for them. The views with their own filter
sets — memory, history, docs — offer their axes and no free-text box, so
narrowing to a remembered phrase means reading the list.

It is the most basic filter and the one a reader reaches for first when they half
remember a title. Worth doing as one pass across the views rather than one view
at a time, so the control sits in the same place everywhere.

Where it filters — title only, or title and body — should be decided once and
stated in the placeholder, because a search that silently misses body text reads
as broken.

## Acceptance criteria

- [ ] Memory, history and docs each carry a free-text filter in their filter bar.
- [ ] What it matches is the same in every view and is stated in the UI.
- [ ] It composes with the existing filters rather than replacing them.
- [ ] It survives navigation and reload the way the other filters do.
