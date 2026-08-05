---
id: T-0191
title: The Workflow view renders filters it never applies
status: backlog
type: bug
priority: high
area: ui
effort: S
created: 2026-08-05
updated: 2026-08-05
---

`isWorkView` (`packages/workfile/ui/src/main.tsx:933`) is defined by exclusion —
everything that is not overview, docs, history, memory or health — so the
Workflow view gets the shared filter strip at `main.tsx:1424`, with status, area,
type, priority and milestone. `<WorkflowView>` (`main.tsx:1642`) receives
`selectedId` and `onSelect`, and nothing else. The chips move, the URL updates,
the graph does not.

Workflow has its own filters in `components/domain/Workflow.tsx` — relations,
kinds, `hideIsolated` — which do work. The shared ones simply never arrive.

Passing them through is the better fix, not hiding the strip: filtering the graph
by status is the thing you actually want when reading it, and `filterGraph` in
`workflow.ts` is already the seam where the record predicate would go. Triage is
inside `isWorkView` by the same definition and should be checked for the same
gap while here.

## Acceptance criteria

- [ ] Setting status, area, type, priority or milestone changes which nodes the graph draws.
- [ ] The graph's own filters and the shared ones compose rather than override each other.
- [ ] A filter that empties the graph says so, instead of drawing nothing.
- [ ] Triage is checked for the same gap and either fixed or recorded as unaffected.
