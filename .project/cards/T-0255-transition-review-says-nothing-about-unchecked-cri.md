---
id: T-0255
title: transition review says nothing about unchecked criteria
status: review
type: task
priority: low
area: core
source: .project/docs/research/DOC-0007-field-report-a-consuming-agent-on-0-13-0-relayed-2026-09-12.md
related: [DOC-0007]
raised: derived
produced_by:
  model: undeclared
  reasoning: xhigh
  basis: self-reported
created: 2026-09-12
updated: 2026-09-14
scope: [packages/workfile/src/modules/cards, packages/workfile/bin/workfile.ts, packages/workfile/src/modules/mcp, packages/workfile/test]
---

A consuming agent moved a card to `review` with one criterion unchecked. That was right — the criterion was the runtime evidence, which only `done` can carry — but nothing said «1 left unchecked», and the agent asked for the gate to say it and let the move through. `assertAcceptanceMet` runs only for `done` by construction, so `review` is silent whether zero or all criteria are unchecked.

The protocol's own words are the argument: `review` is «every acceptance criterion is met and only runtime evidence is missing», so a move to `review` with three criteria unchecked is usually the «my turn ended» exit wearing the wrong name — the case the two-exits section exists for. A notice, never a refusal: one stderr line with the count and the texts, on `transition`, `patch` and `release --status review`, the same three doors the gate covers. `--json` carries it as `warnings`, the shape `card claim` already uses.

## Acceptance criteria

- [x] A move to `review` with unchecked criteria prints one notice naming how many and which, and completes; with none unchecked it prints nothing
- [x] The notice appears on every door that can set `review`, pinned by a test that drives the three
- [x] `--json` answers carry the notice as `warnings` beside the record

## Activity

- 2026-09-14 20:03Z illodev@local#a112f2f3 via:undeclared/xhigh · claimed
- 2026-09-14 20:15Z illodev@local#a112f2f3 via:undeclared/xhigh · doing → review

## Notes

- 2026-09-14 20:14Z illodev@local#a112f2f3 via:undeclared/xhigh — Built and verified locally on 2026-09-14. reviewNotices in cards/mutations.ts runs inside the guard of each door that can set review — transitionCard, patchCard and releaseCard — beside assertAcceptanceMet, and only on an actual move to review: it returns one notice naming how many criteria are unchecked and which, and the three functions answer it as warnings (empty otherwise). Nothing is refused. The CLI prints each notice as a 'warning:' line on stderr and keeps stdout as it was; under --json the notice rides as warnings beside the record, and a move with nothing unchecked still answers exactly { record }. A transition to doing is a claim and keeps the claim's own reporting. project_card_transition, project_card_patch and project_card_release answer warnings the same way under a MOVE_RESULT schema. docs/cli.md's shape table gives the three commands { record, warnings? }. Pinned by cli.test.ts 'a move to review names the criteria it leaves unchecked, on every door, and never refuses it' (transition on stderr: '... moved to review with 2 unchecked acceptance criteria: #2 The part that is not; #3 The runtime evidence ...'; patch and release under --json; a fully checked card answers only record) and acceptance.test.ts 'a move to review returns what it left unchecked, on every door and over MCP'. acceptance 13/13, mcp, verification, verification-policy and axes 53/53, strict held.
- 2026-09-14 20:15Z illodev@local#a112f2f3 via:undeclared/xhigh — Full suite on this build: typecheck:api and 538/538 tests (exit 0). HTTP routes do not surface the notice; the criteria name the CLI doors and --json, and MCP answers it too. Exit: review — all three criteria are met; the runtime evidence is the next published release carrying it.
