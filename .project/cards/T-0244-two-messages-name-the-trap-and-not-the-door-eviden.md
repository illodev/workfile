---
id: T-0244
title: "Two messages name the trap and not the door: --evidence and --actor"
status: next
type: bug
priority: low
area: core
source: .project/docs/research/DOC-0006-field-report-a-fube-agent-s-session-on-the-workfile-cli-rela.md
tags: [cli, messages, review]
scope: [packages/workfile/src/modules/cards/verification.ts, packages/workfile/bin/workfile.ts, packages/workfile/test]
related: [DOC-0006]
raised: reported
created: 2026-09-11
updated: 2026-09-11
---

Two messages on the paths [[DOC-0006]] walked stop the caller and do not say where to go next.

**`--evidence` on a move to `review`** answers `CARD_VERIFICATION_NOT_APPLICABLE`: "evidence describes how a card was proved, and this write does not move T-0003 into done." True, and it leaves the caller holding the local evidence it wanted to record — a passing test, an output it saw — with no named place for it. The protocol names one: a card note is "the only place that always keeps it". The refusal does not.

**`--actor` on a claim** warns: "claimed as X, but this session is Y. The edit guard will ask about this claim, and releasing it needs `--actor X`. Run `agents whoami` to see which identity is yours." Also true, and the repair is one word the message never says: *omit the flag*. A consumer whose CLAUDE.md still teaches `--actor <session-id>` reads the warning on every claim and cannot learn from it that the flag is the problem.

Whether `review` should accept `--evidence` and file it as a note is a design decision and is not decided here; it is left to the owner on DOC-0006. Naming the door is not a decision.

## Acceptance criteria

- [ ] `CARD_VERIFICATION_NOT_APPLICABLE` on a move that is not a close names `card note ID --text` as where local evidence goes.
- [ ] The `--actor` mismatch warning says that omitting `--actor` claims as this session, before it says what the flag costs.
- [ ] Both messages are pinned by a test that reads them.
