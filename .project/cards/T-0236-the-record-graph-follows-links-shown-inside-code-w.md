---
id: T-0236
title: The record graph follows links shown inside code, which the doc checker masks
status: backlog
type: bug
priority: low
area: core
origin: [T-0232]
raised: derived
created: 2026-09-03
updated: 2026-09-03
---

`codeMask` exists because a link being *shown* is not a link being *followed*: a template that teaches the house style by printing `` `[texto](categoria/slug)` `` was reported as linking to a category that does not exist — the document doing its job, called broken. `diagnoseDocuments` consults the mask; `markdownDocumentPaths`, which builds the `markdown` relation of the record graph, does not.

So an example link inside a fence becomes a **relationship** between records: a backlink somebody has to explain, and an edge in the graph view that means nothing. `_TEMPLATE.md` teaching a link style ends up related to whatever slug it used as an example.

This surfaced while unifying the two link extractors in T-0232 and was deliberately **not** changed there: sharing the scanner is behaviour-preserving, masking is not, and mixing the two would have made a five-line fix into a graph change nobody asked for.

## What has to be decided, not just implemented

Whether a link inside code is an edge is a real question, not an oversight to correct:

- **Mask it, like the checker.** Consistent, and the argument is the same one that put the mask in the checker. But a body that documents a relationship by quoting it — a card whose whole point is a path, printed in a fence — loses its edge.
- **Keep it, and say so.** The graph is about what a record mentions, and mentioning in a fence is still mentioning. Then the asymmetry is a decision and the docblock says why.

Measuring it is what settles it: count the `markdown` edges that come from inside a code span on a repository with a real corpus, and look at what they are.

## Acceptance criteria

- [ ] Measured how many `markdown` edges originate inside code, on a real corpus
- [ ] One of the two readings chosen, with the count next to it
- [ ] The two extractors' treatment of code is the same, or the difference is written down where both are

## Activity

- 2026-09-03 14:22Z illodev@local#062a7c97 · renumbered from T-0234
