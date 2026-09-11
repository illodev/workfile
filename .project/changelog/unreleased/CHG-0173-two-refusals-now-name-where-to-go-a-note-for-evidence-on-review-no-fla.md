---
id: CHG-0173
title: "Two refusals now name where to go: a note for evidence on review, no flag for your own claim"
type: changed
area: core
visibility: public
cards: [T-0244]
tags: [cli, messages]
created: 2026-09-11
updated: 2026-09-11
---

`--evidence` on a move to `review` is still refused with `CARD_VERIFICATION_NOT_APPLICABLE` — evidence describes how a card was proved, and review is not a close — but the refusal now says where the local evidence goes: a note on the card, by `card note ID --text` or `project_card_note`, which the protocol already names as the one place that always keeps it. The `--actor` mismatch warning on a claim now opens with the repair, *omit `--actor` to claim as this session*, before it lists what the flag costs; a consumer whose generated instructions still taught `--actor <session-id>` was reading the cost on every claim without being told the flag was the problem.
