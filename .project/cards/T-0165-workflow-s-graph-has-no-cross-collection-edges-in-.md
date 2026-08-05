---
id: T-0165
title: Workflow's graph has no cross-collection edges in the curated corpus
status: backlog
type: task
priority: medium
area: docs
created: 2026-08-05
updated: 2026-08-05
---

`scripts/screenshot-workspace.ts` writes 14 docs and 12 memory records, and not one of them declares a frontmatter relation to a card. `DEFAULT_KINDS` is `["card", "memory", "doc"]`, so those nodes are admitted — and then dropped as isolated, because they have no edges. `mention` is off by default for a good reason (294 of 742 edges in this workspace), and prose is the only place the fixture links anything across a collection.

So the Workflow capture draws 46 nodes and 44 edges, all of them cards. The view whose entire point is that a card, the decision behind it and the release that shipped it are one object shows the cards on their own, everywhere it is used: `.github/media/workflow.png`, the README gallery, and the tour in `scripts/demo-video.ts`.

This was caught by writing a caption the picture did not support. The caption was rewritten to match the picture; the picture is what should change.

Giving a handful of fixture docs a `source` or `cards` relation, and a decision a `decisions` or `origin` edge to the card it settled, would draw the cross-collection graph without touching the view. The corpus is deterministic on purpose, so this is fixture data, not a feature.

## Acceptance criteria

- [ ] The curated corpus declares relations between cards, docs and memory
- [ ] The Workflow capture shows nodes from more than one collection
- [ ] The README and the tour describe what their picture shows
