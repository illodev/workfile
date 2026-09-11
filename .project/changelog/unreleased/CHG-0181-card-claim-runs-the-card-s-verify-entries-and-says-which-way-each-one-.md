---
id: CHG-0181
title: card claim runs the card's verify entries and says which way each one moved
type: added
area: core
visibility: public
cards: [T-0234]
created: 2026-09-11
updated: 2026-09-11
---

A card is a photograph of a repository that moves, and nobody ran card verify before claiming because a step off the path is a step not taken: the board this was measured on had 2 700 cards and two verify blocks. card claim, in the CLI and through project_card_claim, now runs the claimed card's declared commands once the claim is written and warns when a verdict disagrees with the card — a criterion marked met whose command no longer holds, or one unchecked whose command already does — naming the direction and what was proved rather than the exit code, since a search exits 0 when it finds. Nothing is written and nothing is refused; a card with no verify block never reaches the runner. --json carries the run under verify.
