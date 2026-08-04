---
id: ADR-0010
title: The Workflow view draws its own graph, without a graph library
status: accepted
created: 2026-08-04
updated: 2026-08-04
related: [ADR-0005, T-0156, T-0155]
scope: [packages/workfile/ui/src]
---
The Workflow view draws its own graph. No graph library is added.

## Context

T-0156 asks for a canvas of records with typed edges, pan, zoom and curved
connectors. The obvious move is React Flow (or xyflow, Cytoscape, vis-network).
T-0156 required this be decided rather than discovered halfway, and against
[[ADR-0005]] specifically.

The constraint people reach for first does not apply. The zero-runtime-dependency
guarantee is about a consumer's `node_modules`; `dependencies` is exactly
`@types/node` and the UI ships precompiled into `dist/ui`, so a bundled
`devDependency` would not breach it.

Three things do apply.

**Weight.** `dist/ui` is 900K. Its largest chunk is React at 190K, and
`ui-primitives` — the entire shadcn surface every view shares — is 112K. A
graph library lands in the same order of magnitude as the whole design system,
for one view.

**Visual language.** [[ADR-0005]] records that coexistence by layers is what
killed two previous migrations. A graph library arrives with its own node
chrome, its own handles, its own selection and hover treatment, its own
controls. Inside a shadcn interface that is a second design system in a corner
of the app, which is the exact failure that ADR is about.

**Size of the problem.** Measured for [[T-0155]]: the default node set is 204
records with 227 edges. A force simulation at that size is 41,000 pair
comparisons per tick — no quadtree, no worker, no incremental layout. The hard
parts of a graph library, which are the ones that justify its weight, are the
parts this graph does not have.

## Decision

Hand-write the layout and the canvas: a force-directed simulation over plain
objects, SVG for nodes and cubic-bezier edges, wheel-zoom and drag-pan on a
transform. Nodes are drawn from the same primitives every other view uses, so a
record looks like a record.

## Consequences

The layout is ours to tune and ours to fix. There is no free edge routing, no
free minimap, no free layout algorithms beyond the one written. If the view
later needs orthogonal routing, clustering, or a graph an order of magnitude
larger, this decision is worth reopening — the interface between the data and
the canvas is a positions map, so replacing the layout does not touch the
filters or the fetch.

Reversal is cheap while the node set stays this size. That is the reason to
start here rather than to commit to a dependency for a view nobody has used
yet.
