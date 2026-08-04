---
id: T-0155
title: The inspector shows where a record came from and what it spawned
status: done
type: feature
priority: medium
area: ui
depends: [T-0154]
effort: S
created: 2026-08-04
updated: 2026-08-04
scope: [packages/workfile/ui/src, packages/workfile/src/modules/api]
---
`Inspector.tsx` already builds two lists for the selected record: references
out (`parent`, `depends`, labelled by relation) and backlinks in (`child`, and
anything pointing at it). Once [[T-0154]] lands, `origin` is two more rows in
machinery that exists — forward as **origin**, reverse as **spawned**.

## Why this is its own card and not a line in the graph one

It is the cheapest possible test of whether the edges are worth drawing.

After T-0154 migrates the 28 prose provenances there will be roughly 126
explicit card-to-card edges over 153 cards. That is either a graph with real
structure or a thin scattering, and nobody knows which until the edges exist.
The inspector answers that question for the price of two rows, and the answer
changes what [[T-0156]] should build: a graph that reads well whole, or one
that starts from a node and expands.

It also has standalone value. Half the reason for wanting the view — *"otherwise
I have to click card by card"* — is partly served by never having to leave the
record you are on.

## Design notes

- Reverse edges are derived, never stored. A card names its origins; nothing
  writes a `spawned` field, and the doctor should not invent one.
- The drawer (`RecordDrawer.tsx`) shows memory records and docs the same way a
  card is shown, so a decision that spawned work gets the reverse row too. That
  is the ADR-0005-to-T-0038 case, visible without opening a card.
- Relation labels are already a string column; nothing needs restructuring.

## Acceptance criteria

- [x] Origin rows appear in the references list, labelled
- [x] Spawned rows appear in the backlinks list, derived not stored
- [x] A memory record or doc that spawned a card shows it in the drawer
- [x] A note records how dense the card graph turned out, for [[T-0156]]
- [x] `pnpm run check` green, doctor 0/0

## Activity

- 2026-08-04 21:23Z illodev@local#cfe281b4 · claimed
- 2026-08-04 21:28Z illodev@local#cfe281b4 · doing → review
- 2026-08-04 21:34Z illodev@local#cfe281b4 · review → done

## Notes

- 2026-08-04 21:27Z illodev@local#cfe281b4 — Measured, which is what this card existed to do, and the answer inverts what T-0156 assumed. The card-only graph is an archipelago: 159 cards, 55 explicit card-to-card edges, 102 of them (64 percent) with no card edge at all, 117 connected components, and the largest holds 8 nodes. Median degree is 0 and the maximum is 4. parent contributes zero edges — 159 cards and not one uses hierarchy; the edges are related 30, origin 21, depends 4. Drawn whole, that is a hundred floating dots and forty islands, which is not a view. The full record graph is a different object: 328 records, 449 explicit non-mention edges, only 9 percent isolated, 46 components, and the largest holds 225 records — 111 cards, 80 changes, 22 memory records, 8 releases and 4 docs. So 111 of the 159 cards are in one component, but only when changelog fragments and releases are nodes too. The changelog is the connective tissue: a fragment names the cards it closes, a release names its fragments. Conclusion for T-0156: the Workflow view is over records, not over cards. A card-only canvas cannot be made legible by layout because the edges are not there.
- 2026-08-04 21:34Z illodev@local#cfe281b4 — Verified on the platform: PR #17 green across the matrix and merged at 572d5b6.
