---
id: T-0255
title: transition review says nothing about unchecked criteria
status: backlog
type: task
priority: low
area: core
source: .project/docs/research/DOC-0007-field-report-a-consuming-agent-on-0-13-0-relayed-2026-09-12.md
related: [DOC-0007]
raised: derived
produced_by:
  model: claude-fable-5-1
  reasoning: xhigh
  basis: self-reported
created: 2026-09-12
updated: 2026-09-12
---

A consuming agent moved a card to `review` with one criterion unchecked. That was right — the criterion was the runtime evidence, which only `done` can carry — but nothing said «1 left unchecked», and the agent asked for the gate to say it and let the move through. `assertAcceptanceMet` runs only for `done` by construction, so `review` is silent whether zero or all criteria are unchecked.

The protocol's own words are the argument: `review` is «every acceptance criterion is met and only runtime evidence is missing», so a move to `review` with three criteria unchecked is usually the «my turn ended» exit wearing the wrong name — the case the two-exits section exists for. A notice, never a refusal: one stderr line with the count and the texts, on `transition`, `patch` and `release --status review`, the same three doors the gate covers. `--json` carries it as `warnings`, the shape `card claim` already uses.

## Acceptance criteria

- [ ] A move to `review` with unchecked criteria prints one notice naming how many and which, and completes; with none unchecked it prints nothing
- [ ] The notice appears on every door that can set `review`, pinned by a test that drives the three
- [ ] `--json` answers carry the notice as `warnings` beside the record
