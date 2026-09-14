---
id: CHG-0195
title: A move to review names the acceptance criteria it leaves unchecked
type: changed
area: core
visibility: public
cards: [T-0255]
created: 2026-09-14
updated: 2026-09-14
---

The acceptance gate refuses only `done`, so a card moved to `review` with every criterion still open said nothing — and `review` means every criterion is met and only runtime evidence is missing. `card transition ID review`, `card patch` setting `review` and `card release --status review` now print one `warning:` line on stderr naming how many criteria are unchecked and which, and complete as before. With `--json` the notice rides as `warnings` beside the record; a move with nothing unchecked still answers `{ record }`. The `project_card_transition`, `project_card_patch` and `project_card_release` MCP tools answer `warnings` the same way. `review` is never refused: a criterion that is the runtime evidence is legitimately open there.
