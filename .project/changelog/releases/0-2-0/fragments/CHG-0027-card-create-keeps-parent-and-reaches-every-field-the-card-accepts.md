---
id: CHG-0027
title: card create keeps --parent, and reaches every field the card accepts
type: fixed
area: core
visibility: public
cards: [T-0052]
created: 2026-07-31
updated: 2026-07-31
---

`--parent` was registered as a known flag and read by nothing on the create
path, so it passed the unknown-flag guard, never reached the card, and the
command still exited 0 — a hierarchy built that way came out silently flat.

It is wired now, along with the rest of the gap between the flag surface and the
mutation: `--source`, `--depends`, `--milestone`, `--effort`, `--related`,
`--start` and `--due` all write the field they name. A test walks
`CARD_PATCHABLE_FIELDS` and fails if a future field is patchable but unreachable
from `card create`, so the drift closes rather than this one instance.
