---
id: T-0159
title: The graph cannot tell parent from depends, related or origin
status: backlog
type: feature
priority: high
area: core
effort: M
scope: [packages/workfile/src/modules/records/index.ts, packages/workfile/test/budgets.test.ts, packages/workfile/test/docs.test.ts]
origin: [T-0154]
created: 2026-08-04
updated: 2026-08-04
---

`classifiedReferences` maps every explicit frontmatter link to the single
relation `reference`. `buildProjectIndex` adds `source` and `markdown` on top,
and prose scraping contributes `mention`. That is the whole vocabulary:

```
source · reference · markdown · mention
```

So in the index, a `parent` edge, a `depends` edge, a `related` edge and an
`origin` edge are the same edge. The field that produced it is discarded at the
moment it is read.

## Why this blocks the Workflow view

[[T-0156]] is specified around filtering by connection type — hide `related`,
show `parent`, follow `origin` back to where a decision came from. The data to
do that does not exist yet. A graph drawn today can only offer
`explicit / prose`, which is a two-way switch, not a filter panel.

[[T-0154]] hit this from the other side: `agents context` had to read the
`origin` field off the card directly, because the edge could not say which of a
card's explicit links were provenance. That works for one field on one record,
and does not generalize to a graph.

## Second half: two edges are invisible to listings

`SUMMARY_FIELDS` carries `parent` and now `origin`, but **not `depends` and not
`related`**. A record in summary projection — what `project_card_list` and the
UI boards receive — cannot draw those two edges at all, whatever the relation
is called. Both halves have to land together or the view still cannot filter
what it cannot see.

## What it breaks

Not a private detail. `relation` is rendered as a visible label in
`Inspector.tsx`, `Docs.tsx`, `Memory.tsx` and `History.tsx`, and it is asserted
on in two tests:

- `budgets.test.ts` requires `relations.has("reference")` and ranks `reference`
  above `mention` in the backlink truncation order
- `docs.test.ts` compares a sorted list of incoming relations

The truncation rank is the part worth care: `RELATION_RANK` decides which
backlinks survive on a hub record with more than `maxBacklinks`, and splitting
`reference` into four names silently changes which ones are kept. Whatever
replaces it has to keep frontmatter edges above prose.

## Measured on this workspace

643 edges: 396 explicit, 247 prose mentions — 38% noise if the two are not told
apart, which is the reason `mention` exists. Splitting the remaining 396 by the
field that produced them is the same argument applied one level down.

## Design notes

The obvious shape is to name the relation after the field: `parent`, `depends`,
`related`, `origin`, alongside the existing `source`, `markdown`, `mention`.
Open question worth deciding before building: whether consumers get a second
field — a coarse `class` of `explicit | prose` next to the precise `relation` —
so `RELATION_RANK` and the budget test keep a stable thing to sort on while the
UI gets the specific name.

## Acceptance criteria

- [ ] Each explicit frontmatter field produces a relation named after it
- [ ] Prose mentions stay distinguishable from every frontmatter edge
- [ ] Backlink truncation still prefers frontmatter edges over prose
- [ ] `depends` and `related` reach the summary projection
- [ ] The UI labels the specific relation rather than `reference`
- [ ] `pnpm run check` green, doctor 0/0

## Notes

- 2026-08-04 20:56Z illodev@local#cfe281b4 — Measured after the T-0154 backfill landed 21 origin edges on this repository: 11 of them, 52 percent, are invisible in the graph. Each is a card that already carried depends or related to the same id, and classifiedReferences keys its map by target id, so the origin merges into the existing edge and the relation stays 'reference'. T-0061->T-0054, T-0096->T-0088, T-0098->T-0088, T-0100->T-0098, T-0112->T-0109, T-0113->T-0109, T-0115->T-0108, T-0117->T-0108, T-0128->T-0104, T-0129->T-0104, T-0130->T-0128. So the collapse is not only a missing label: it silently drops half the provenance that was just declared. A card pair can hold two different relationships at once and the index can represent one.
