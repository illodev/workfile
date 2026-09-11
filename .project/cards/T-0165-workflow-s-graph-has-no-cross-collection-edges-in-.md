---
id: T-0165
title: Workflow's graph has no cross-collection edges in the curated corpus
status: review
type: task
priority: medium
area: docs
created: 2026-08-05
updated: 2026-09-11
scope: [scripts/screenshot-workspace.ts, scripts/screenshots.ts, scripts/demo-video.ts, .github/media, site/assets, README.md]
---

`scripts/screenshot-workspace.ts` writes 14 docs and 12 memory records, and not one of them declares a frontmatter relation to a card. `DEFAULT_KINDS` is `["card", "memory", "doc"]`, so those nodes are admitted — and then dropped as isolated, because they have no edges. `mention` is off by default for a good reason (294 of 742 edges in this workspace), and prose is the only place the fixture links anything across a collection.

So the Workflow capture draws 46 nodes and 44 edges, all of them cards. The view whose entire point is that a card, the decision behind it and the release that shipped it are one object shows the cards on their own, everywhere it is used: `.github/media/workflow.png`, the README gallery, and the tour in `scripts/demo-video.ts`.

This was caught by writing a caption the picture did not support. The caption was rewritten to match the picture; the picture is what should change.

Giving a handful of fixture docs a `source` or `cards` relation, and a decision a `decisions` or `origin` edge to the card it settled, would draw the cross-collection graph without touching the view. The corpus is deterministic on purpose, so this is fixture data, not a feature.

## Acceptance criteria

- [x] The curated corpus declares relations between cards, docs and memory
- [x] The Workflow capture shows nodes from more than one collection
- [x] The README and the tour describe what their picture shows

## Activity

- 2026-09-11 17:11Z illodev@local#597ecdc9 · claimed
- 2026-09-11 17:18Z illodev@local#597ecdc9 · released

## Notes

- 2026-09-11 17:18Z illodev@local#597ecdc9 — The corpus now declares its relations in frontmatter: related on nine docs (the spec, the MCP contract, the claims design, the watcher notes, the release runbook, search, the codec, the demo pipeline, the roadmap) and on all twelve memory records, plus cards/decisions on six changelog fragments; references name a record by title and resolve to IDs at write time, so reordering a table cannot re-point an edge. Docs that track a done card are dated after it, otherwise doc-related-card-newer would have added four fixture warnings to the Overview tile (doctor on the corpus: 0 errors, 29 warnings, unchanged). Recaptured at 0.12.0: the Workflow still reads 67 nodes · 79 edges with DOC, LRN, ADR, INC, CONV and CTX nodes wired to cards — the previous capture was 46 nodes · 44 edges, all cards. README paragraph and the tour caption in scripts/demo-video.ts now describe that graph; the film itself has not been recut, so the published mp4 still shows the card-only caption until the next cut — a publishing decision, raised in the session rather than carded.
