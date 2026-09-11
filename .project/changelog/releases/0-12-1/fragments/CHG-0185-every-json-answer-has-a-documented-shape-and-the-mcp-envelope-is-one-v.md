---
id: CHG-0185
title: Every --json answer has a documented shape, and the MCP envelope is one variable away
type: changed
area: core
visibility: public
cards: [T-0246]
created: 2026-09-11
updated: 2026-09-11
---

The CLI grew a --json shape per command — the card itself, { record, warnings } on claim, { records, total } on a list — and a caller ended up reading every answer with d.get('record', d). cli.md now carries a table of what every subcommand answers, pinned by a test that runs each record-answering command in both shapes. The decision, taken 2026-09-11: the CLI converges on the MCP envelope in 0.13.0, when every record answer becomes { record }. Until then each such answer prints its legacy shape and says so once per process on stderr, and WORKFILE_JSON_ENVELOPE=1 opts a caller into the envelope today. --fields now applies to every record answer, so transition --json --fields id,status,revision is the answer without the body that a --quiet was asked for.
