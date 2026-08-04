---
id: CHG-0111
title: A Workflow view draws the record graph, with a filter per relationship
type: added
area: ui
visibility: public
cards: [T-0156]
decisions: [ADR-0010]
created: 2026-08-04
updated: 2026-08-04
---

A tenth view. Records are nodes, typed relationships are edges, and every
relationship the index can emit has a toggle that turns it off. It answers the
one question no other view does — *where did this come from* — and deliberately
not the one Flow and Overview already answer.

## The defaults are measurements, not preferences

`mention` is off: prose scanning contributes 294 of this workspace's 742 edges
and turns the SPEC's citation of RFC 2119 into one. Changes and releases are
off: a release hangs off fifteen to twenty fragments, which takes maximum
degree from 11 to 25, and "what shipped together" is what History and Timeline
already answer.

Wiki links are **on**, which was the surprise. Counting `[[T-0154]]` in bodies
takes the card graph from 45 edges to 115 and its largest component from 9
nodes to 65. Seven eighths of the relationships in this repository live in
prose rather than in frontmatter. Off, the view opens on a graveyard.

So a declared edge is drawn solid and a prose one dashed. ADR-0005 leaves
colour spoken for by status, and the encoding is the more honest one anyway: an
ID in a sentence is a weaker claim than a frontmatter field. It also makes the
view an instrument — a dashed edge between two records that obviously belong
together is a missing `origin` or `related`, visible at a glance.

## Node set

Cards, memory and docs by default. Measured on T-0155: a cards-only canvas is
159 nodes with 55 edges, 64% of them isolated, breaking into 117 components
whose largest is 8. Over records it is one object — 449 edges, 9% isolated, and
a largest component of 225. `parent` contributes zero edges across the entire
repository, so nothing here can lean on hierarchy.

## Cost

The layout is hand-written, per [[ADR-0010]]: a force simulation over plain
objects, SVG curves, and a transform for pan and zoom. The view is 9.6 kB, 3.9
kB gzipped, and `dist/ui` grew from 900K to 912K. A graph library is the weight
of the entire shadcn surface for one view, and it arrives with its own visual
language inside a design system that ADR-0005 exists to keep coherent.

A `graph` projection carries it: the same 332 records cost 75 KB this way
against 305 KB as summaries, because a canvas needs a node and its edges and
not a per-link title it can already resolve. Edges whose target resolves to no
record are dropped there — a graph is the one reader that would otherwise draw
`RFC-2119` as a node.
