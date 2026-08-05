---
id: CHG-0128
title: A note quoting a trail entry is no longer filed as one
type: fixed
area: core
visibility: public
created: 2026-08-05
updated: 2026-08-05
---

`doctor --fix` could move a card note into `## Activity` when the note quoted a trail entry inline. The pattern that recognises a trail line searched the whole line for the separator instead of reading the one that follows the actor, so a note about the trail looked like an entry of it — and the repair files what it matches into the protocol section.

Fenced examples were already safe. Inline quotes now are too.
