---
id: T-0244
title: "Two messages name the trap and not the door: --evidence and --actor"
status: done
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
verified:
  at: "2026-09-11T15:55:43.498Z"
  method: manual
  commit: c25eaef13be31118d86459bc6cad1ba990ddeb30
  digest: "sha256:fecbe3e24a4a823eeec1ef34068e69d99ceb42da222f5ea9d176f9e889be9df2"
---

Two messages on the paths [[DOC-0006]] walked stop the caller and do not say where to go next.

**`--evidence` on a move to `review`** answers `CARD_VERIFICATION_NOT_APPLICABLE`: "evidence describes how a card was proved, and this write does not move T-0003 into done." True, and it leaves the caller holding the local evidence it wanted to record — a passing test, an output it saw — with no named place for it. The protocol names one: a card note is "the only place that always keeps it". The refusal does not.

**`--actor` on a claim** warns: "claimed as X, but this session is Y. The edit guard will ask about this claim, and releasing it needs `--actor X`. Run `agents whoami` to see which identity is yours." Also true, and the repair is one word the message never says: *omit the flag*. A consumer whose CLAUDE.md still teaches `--actor <session-id>` reads the warning on every claim and cannot learn from it that the flag is the problem.

Whether `review` should accept `--evidence` and file it as a note is a design decision and is not decided here; it is left to the owner on DOC-0006. Naming the door is not a decision.

## Acceptance criteria

- [x] `CARD_VERIFICATION_NOT_APPLICABLE` on a move that is not a close names `card note ID --text` as where local evidence goes.
- [x] The `--actor` mismatch warning says that omitting `--actor` claims as this session, before it says what the flag costs.
- [x] Both messages are pinned by a test that reads them.

## Activity

- 2026-09-11 15:25Z illodev@local#597ecdc9 · claimed
- 2026-09-11 15:27Z illodev@local#597ecdc9 · doing → review
- 2026-09-11 15:55Z illodev@local#597ecdc9 · review → done

## Notes

- 2026-09-11 15:27Z illodev@local#597ecdc9 — Fixed: CARD_VERIFICATION_NOT_APPLICABLE names 'card note ID --text' and project_card_note as where evidence on a non-closing move goes; warnActorMismatch opens with 'Omit --actor to claim as this session' before the cost. Pinned in verification.test.ts (message) and cli.test.ts (warning order, and silence without the flag). Local evidence: both observed on the built binary against a scratch workspace. Whether review should accept --evidence as a note is left to the owner on DOC-0006. Missing: the published package in a consumer.
- 2026-09-11 15:55Z illodev@local#597ecdc9 — manual verification: @illodev/workfile@0.11.0 from npm: transition ID review --evidence is refused naming 'card note ID --text'; card claim ID --actor probe-bot warns 'Omit --actor to claim as this session' before the cost.
