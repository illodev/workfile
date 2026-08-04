---
id: T-0156
title: A Workflow view draws the record graph, with the edges you choose
status: review
type: feature
priority: medium
area: ui
depends: [T-0154, T-0155, T-0159]
effort: L
created: 2026-08-04
updated: 2026-08-04
scope: [packages/workfile/ui/src]
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

- [x] A Workflow view renders records as nodes and typed relations as edges
- [ ] Pan and zoom, with connectors that read at both extremes
- [x] Edge-type filters, `mention` off by default
- [x] Kind filters, so history records are opt-in
- [x] Filter state survives navigation, as the timeline's grouping does
- [x] Selecting a node opens the same drawer every other view opens
- [x] The library choice is recorded as a decision, against ADR-0005
- [x] Reads at 321 records without a hand-tuned layout
- [x] `pnpm run check` green, doctor 0/0

## Notes

- 2026-08-04 21:27Z illodev@local#cfe281b4 — Design input from T-0155, measured rather than assumed, and it changes this card's premise. A cards-only canvas is not viable: 159 cards carry 55 explicit card-to-card edges, 64 percent of cards have none at all, and the graph breaks into 117 components whose largest is 8 nodes. Over all records it is one object: 328 records, 449 explicit edges, 9 percent isolated, and a largest component of 225 that contains 111 of the 159 cards alongside 80 change fragments, 22 memory records, 8 releases and 4 docs. The changelog is what connects the board, because a fragment names the cards it closes and a release names its fragments. Two consequences. The node set is records, not cards, and the filters therefore have to include record kind, not only edge type. And parent contributes zero edges across the whole repository, so any layout that leans on hierarchy has nothing to lean on here.
- 2026-08-04 21:33Z illodev@local#cfe281b4 — Node and edge set decided, measured on this workspace rather than assumed. Six candidate sets compared. Cards with declared fields only: 160 nodes, 45 edges, 64 percent isolated, largest component 9. Cards counting wikilinks: 115 edges, largest component 65. Cards plus memory plus docs with wikilinks: 204 nodes, 227 edges, 33 percent isolated, largest component 108, maximum degree 11. Everything including changes and releases: 331 nodes, 454 edges, 9 percent isolated, largest component 236, maximum degree 25. Decision: the default node set is cards, memory and docs. Fragments and releases go behind a toggle, off by default. Releases are the reason: they take maximum degree from 11 to 25 because one hangs off fifteen to twenty fragments, they are visual hubs, and they connect records by when the work shipped, which is what the history and timeline views already answer better. Wikilinks must count as edges by default or the view opens on a graveyard: they are 154 edges against 45 declared card edges, so seven eighths of the card graph lives in prose rather than in frontmatter. But they are weaker data, with no direction and no doctor rule, so they must render differently from a declared edge. That makes the view a backfill instrument as well as a reader: a dashed edge between two cards that obviously belong together is a missing origin or related, visible at a glance.
- 2026-08-04 21:49Z illodev@local#cfe281b4 — Criterion 2 is left unchecked deliberately. Its second half is tested — the curve helper is asserted to leave and arrive where a straight line would and to bow, and stroke width, dash length and label size all divide by the scale so an edge reads the same at 0.08x and at 4x. Its first half, pan and zoom as an interaction, is implemented and type-checked and has never been clicked, because nothing here runs a browser. Checking it would be asserting something I did not observe, which is the T-0152 mistake. One look closes it. Everything else is verified: the layout test settles this repository's own 332-record graph and asserts it neither collapses to a blob nor flies apart, with a median nearest-neighbour gap above 12px so nodes stay individually clickable; filterGraph is tested for the default set, for an edge surviving on any kept relation, and for degree counted over surviving edges rather than declared ones; reconcile is tested to hold the positions of nodes that survive a filter change; seeding is tested to be deterministic and to never stack two nodes on one point, and the coincident-node case is tested not to become NaN, which is the failure that would blank the canvas with no error anywhere. The demo snapshot has its own parity check that the default filters leave something standing.

## Activity

- 2026-08-04 21:33Z illodev@local#cfe281b4 · claimed
- 2026-08-04 21:49Z illodev@local#cfe281b4 · doing → review

