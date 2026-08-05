---
id: T-0191
title: The Workflow view renders filters it never applies
status: done
type: bug
priority: high
area: ui
effort: S
created: 2026-08-05
updated: 2026-08-05
scope: [packages/workfile/ui/src]
verified:
  at: "2026-08-05T23:50:17.824Z"
  method: local
  commit: 434317ee8b3ab53824bc319fcf210df6ce36c2ac
  digest: "sha256:895f22c3c93f586423904e9c6efe7463629a1d6abeabe93a1cc7a5910fa6cfe8"
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

- [x] Setting status, area, type, priority or milestone changes which nodes the graph draws.
- [x] The graph's own filters and the shared ones compose rather than override each other.
- [x] A filter that empties the graph says so, instead of drawing nothing.
- [x] Triage is checked for the same gap and either fixed or recorded as unaffected.

## Activity

- 2026-08-05 18:13Z illodev@local#bf4c5f67 · claimed
- 2026-08-05 18:34Z illodev@local#bf4c5f67 · doing → review
- 2026-08-05 23:50Z illodev@local#bf4c5f67 · review → done

## Notes

- 2026-08-05 18:33Z illodev@local#bf4c5f67 — Fixed and verified in a browser (Playwright against the served UI on 8899). The strip reaches the canvas: 188 nodes with no filter, 34 for area=ui, 85 for type=bug, 4 for priority=critical. priority and milestone were not in the graph projection at all, so the payload gained both. Two things the browser found that the unit tests could not. Records of other kinds pass every card axis, and memory and doc records hold each other up, so status=review drew 31 nodes of which one was a card; a non-card record now earns its place by touching a surviving card. And an empty canvas has two causes the reader acts on differently, so filterGraph reports how many matched and were then hidden as isolated, and the view offers the toggle rather than saying nothing matched when something did. Triage is unaffected: it takes visibleTasks, which is filterTasks(tasks, effectiveFilters). showClosed and showIdeas are deliberately not honoured on the graph, and free text is left to T-0195 because the shell's search carries a token grammar and a regex form.
- 2026-08-05 18:47Z illodev@local#bf4c5f67 — CI green on PR #27 (Windows, macOS, Ubuntu; Node 22 and 24). Browser evidence stands from the local run against the served build: the graph draws 188 nodes and 330 edges unfiltered, area narrows it to 34, type to 85, priority to 4, and the two empty-canvas states report their own cause.
- 2026-08-05 23:50Z illodev@local#bf4c5f67 — local verification: Built UI served at 127.0.0.1:4390, driven with Playwright at 1440x900: Workflow draws 225 nodes unfiltered and 172 with status=done, so the shared filters reach the graph. status=discarded&area=mcp&type=chore draws 0 nodes and says 'No records match these filters.' on screen instead of an empty canvas.
