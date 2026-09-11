---
id: T-0243
title: The title cap is discoverable only by being refused
status: done
type: bug
priority: medium
area: core
source: .project/docs/research/DOC-0006-field-report-a-fube-agent-s-session-on-the-workfile-cli-rela.md
tags: [cli, schema, help]
scope: [packages/workfile/bin/workfile.ts, packages/workfile/src/modules/cards/validation.ts, packages/workfile/src/modules/cards/cards.ts, packages/workfile/src/modules/docs/docs.ts, packages/workfile/src/workspace/load-workspace.ts, packages/workfile/src/types.ts, packages/workfile/src/modules/mcp/tools.ts, packages/workfile/test, packages/workfile/docs/cli.md]
related: [DOC-0006]
raised: reported
created: 2026-09-11
updated: 2026-09-11
verified:
  at: "2026-09-11T15:55:43.277Z"
  method: manual
  commit: c25eaef13be31118d86459bc6cad1ba990ddeb30
  digest: "sha256:3bedd55a766f516ad27bee04610538d77ba073d58734d24e673da8ca73ca02f2"
---

`CARD_TITLE_TOO_LONG` refuses a card title past 80 characters and `DOC_TITLE_TOO_LONG` a document title past 120. Neither number is anywhere a caller looks before writing: not in `--help`, not in `docs/cli.md`, not in `workfile schema --json` — the command the protocol sends agents to for valid values without guessing. The MCP `project_card_create` input schema carries `maxLength: 80` and is the only surface that does.

[[DOC-0006]]: seven of eleven creations in one session failed on this, each after the whole body had been composed. The body is not lost — the refusal happens before any write — but the call is, and a caller that learns a limit by being refused seven times has learnt to distrust the help.

Truncating with a warning was suggested. It is not taken: a title is the line the board shows, and a tool that shortens it silently decides for the author what the card is about. The limit is shown instead, where an agent already reads.

## Acceptance criteria

- [x] `workfile schema --json` reports `cards.limits.title` = 80 and `docs.limits.title` = 120, read from the same constants the validators use.
- [x] `workfile card --help` and `workfile doc --help` state the title limit on the `--title` usage line.
- [x] `CARD_TITLE_TOO_LONG` and `DOC_TITLE_TOO_LONG` say how long the title was, not only what the maximum is.
- [x] `docs/cli.md` names both limits where it documents `card create` and `doc create`.

## Activity

- 2026-09-11 15:22Z illodev@local#597ecdc9 · claimed
- 2026-09-11 15:25Z illodev@local#597ecdc9 · doing → review
- 2026-09-11 15:55Z illodev@local#597ecdc9 · review → done

## Notes

- 2026-09-11 15:25Z illodev@local#597ecdc9 — Fixed: CARD_TITLE_MAX_LENGTH (80) and DOC_TITLE_MAX_LENGTH (120) live in config/defaults.ts and are read by the validators, the doctor's long-title rule, effectiveSchema (cards.limits.title, docs.limits.title), the MCP card/doc create input schemas and the --title usage lines. Local evidence: cli.test.ts 'the title cap is stated before it is met' passes on the built binary; on a scratch workspace schema --json reports both limits and an 81-character title answers 'title has 81 characters; the maximum is 80'. Missing: the published package in a consumer.
- 2026-09-11 15:55Z illodev@local#597ecdc9 — manual verification: @illodev/workfile@0.11.0 from npm: schema --json reports cards.limits.title 80 and docs.limits.title 120; card --help states 'TITLE up to 80 characters'; an 81-character title is refused with 'title has 81 characters; the maximum is 80'.
