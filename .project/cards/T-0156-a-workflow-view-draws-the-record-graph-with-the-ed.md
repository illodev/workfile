---
id: T-0156
title: A Workflow view draws the record graph, with the edges you choose
status: backlog
type: feature
priority: medium
area: ui
depends: [T-0154, T-0155, T-0159]
effort: L
created: 2026-08-04
updated: 2026-08-04
---

A tenth view: records as nodes, typed relationships as edges, pan and zoom,
curved connectors, and filters that decide which edges and which kinds are on
screen. The question it answers is the one no current view does — *where did
this come from* — which is a directed acyclic shape and draws well.

## The filters are the feature

Measured on this workspace before [[T-0154]]: 321 records, 643 edges.

| | |
|---|---|
| Explicit edges (`parent`, `depends`, `related`, `[[wiki]]`) | 396 |
| Prose mentions — a bare id in a body | **247**, 38% |
| Changelog fragments + releases | **124 nodes**, 39% of the graph |
| Ids referenced that resolve to no record | 18 |

Those 18 are `RFC-2119`, `CVE-2026`, `ADR-0010`, `DOC-0012` and similar: the
prose scanner reading the SPEC's citation of the MUST/SHOULD keywords RFC and
turning it into a node. Rendered raw, this graph opens on 78 isolated cards and
a node called RFC-2119.

So two defaults are not preferences, they are what makes the view legible:
**`mention` edges off**, and **kind filter on** so 124 history records do not
swamp the layout. `classifiedReferences` already separates `reference` from
`mention` — its own comment says prose was ~43% of edges and "is noise for
anything trying to follow real dependencies." That distinction is the first
toggle.

## Decide before building

- **Whole graph, or neighbourhood-and-expand?** [[T-0155]] answers this: it
  lands the edges and records how dense the result actually is. A median degree
  of 2 over 153 cards reads very differently from 8.
- **Which library, and at what cost to the design system.** ADR-0005 records
  that coexistence by layers is what killed two previous migrations, and a
  graph library arrives with its own interaction and visual language inside a
  shadcn interface. This is decidable — but decide it, do not discover it
  halfway. Note the constraint that does *not* apply: the zero-runtime-dependency
  guarantee is about a consumer's `node_modules`, and the UI ships precompiled
  into `dist/ui`, so a bundled `devDependency` does not breach it. The real
  costs are weight — `dist/ui` is 900K today — and visual coherence.
- **Node identity.** Ten views already agree on how a record looks. A node
  should be a record as the rest of the interface draws one, not a box the
  graph library invented.

## Not this view's job

"What are we working on right now" is Flow and Overview, and a graph does it
worse. If this view tries to answer both it becomes a hairball answering
neither. It is the provenance view.

## On the premise

DOC-0002 records Task Master and Beads holding a task *graph* — as a data
structure driving readiness, not as a canvas. No direct competitor there ships
a visual one. Worth being precise about the novelty though: Obsidian, Roam and
Logseq have shipped note graphs for years. What is unusual is not the canvas,
it is **typed edges over work records** — an edge that means "blocks" or "came
out of", and a filter that can say which.

## Acceptance criteria

- [ ] A Workflow view renders records as nodes and typed relations as edges
- [ ] Pan and zoom, with connectors that read at both extremes
- [ ] Edge-type filters, `mention` off by default
- [ ] Kind filters, so history records are opt-in
- [ ] Filter state survives navigation, as the timeline's grouping does
- [ ] Selecting a node opens the same drawer every other view opens
- [ ] The library choice is recorded as a decision, against ADR-0005
- [ ] Reads at 321 records without a hand-tuned layout
- [ ] `pnpm run check` green, doctor 0/0
