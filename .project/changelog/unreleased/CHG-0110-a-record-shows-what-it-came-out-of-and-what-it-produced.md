---
id: CHG-0110
title: A record shows what it came out of and what it produced
type: added
area: ui
visibility: public
cards: [T-0155]
created: 2026-08-04
updated: 2026-08-04
---

The inspector's two link lists were built from `parent` and `depends` alone.
A card could declare where it came from and what it related to, and neither
reached the panel — so `origin`, the field added for exactly this reading, was
invisible in the one place a reader is already looking.

Outgoing references now include `origin` and `related` alongside `parent` and
`depends`. Backlinks gain **spawned**: every card declaring this record as its
origin. That direction is derived and stored nowhere — a card names its own
origins, and inventing a `spawned` field would create a second copy for the
doctor to disagree with.

Both lists stopped using an `else if` chain. A card can hold several
relationships to the same record at once and the chain kept whichever it tested
first; a card that came out of another *and* depends on it now reads `spawned
depends` on one row rather than appearing as whichever was checked earlier.

`origin` and `related` carry records of any kind, so a row pointing at a
decision or a learning shows the ID without a title — the card corpus is the
only thing the panel can resolve titles from. Shown regardless: half the value
of provenance is that it leaves the board.

Four cards that execute a decision were migrated to declare it: T-0038 from
ADR-0005, and T-0102, T-0103 and T-0104 from ADR-0008. The earlier migration
looked for verbs of discovery and `Per [[ADR-0008]].` uses none, so
decision-to-card provenance was missed entirely. Opening ADR-0008 now shows the
three cards it produced.
