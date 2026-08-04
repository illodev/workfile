---
id: T-0155
title: The inspector shows where a record came from and what it spawned
status: backlog
type: feature
priority: medium
area: ui
depends: [T-0154]
effort: S
created: 2026-08-04
updated: 2026-08-04
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

- [ ] Origin rows appear in the references list, labelled
- [ ] Spawned rows appear in the backlinks list, derived not stored
- [ ] A memory record or doc that spawned a card shows it in the drawer
- [ ] A note records how dense the card graph turned out, for [[T-0156]]
- [ ] `pnpm run check` green, doctor 0/0
