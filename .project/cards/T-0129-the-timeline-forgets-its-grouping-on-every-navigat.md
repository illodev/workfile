---
id: T-0129
title: The timeline forgets its grouping on every navigation
status: backlog
type: task
priority: low
area: ui
scope: [packages/workfile/ui/src/components/domain/Boards.tsx]
related: [T-0104]
created: 2026-08-02
updated: 2026-08-02
---

Found while adding axis grouping ([[T-0104]]), and it predates that work — the
control never persisted anything.

`groupBy` is component state, `TimelineView` is lazy-loaded and only mounted
while the timeline is the current view, so navigating anywhere and back resets
the grouping to `none`. It is not in the URL either: `query.ts` reads and
writes view, record, card, q, status, area, type, priority, milestone, ideas
and closed, and no group key.

It mattered less when the options were `epic` and `area`. It matters more now
that a project can group by its own domain axis, because that is the reading
somebody sets up deliberately and then loses by clicking Docs.

The precedent is in the same file. `FlowBoard` keeps its collapsed columns in
`localStorage` under `workfile-flow-collapsed`, with the reason stated at
Boards.tsx:435-441: the preference belongs to the person, not the session. The
same argument applies here.

Worth deciding rather than assuming: `localStorage` makes it personal and
sticky, the URL makes it shareable — "look at the timeline by context" is a
link somebody might want to send. They are not exclusive, and the existing
filters already live in the URL.

## Acceptance criteria

- [ ] A chosen grouping survives navigating away and back
- [ ] A grouping naming an axis the project no longer declares falls back
      rather than leaving the chart grouped by nothing
- [ ] Where it is kept is a recorded decision, since URL and localStorage
      answer different questions
