---
id: T-0243
title: The title cap is discoverable only by being refused
status: next
type: bug
priority: medium
area: core
source: .project/docs/research/DOC-0006-field-report-a-fube-agent-s-session-on-the-workfile-cli-rela.md
tags: [cli, schema, help]
scope: [packages/workfile/bin/workfile.ts, packages/workfile/src/modules/cards/validation.ts, packages/workfile/src/modules/docs/docs.ts, packages/workfile/src/workspace/load-workspace.ts, packages/workfile/src/types.ts, packages/workfile/test/cli.test.ts, packages/workfile/docs/cli.md]
related: [DOC-0006]
raised: reported
created: 2026-09-11
updated: 2026-09-11
---

`CARD_TITLE_TOO_LONG` refuses a card title past 80 characters and `DOC_TITLE_TOO_LONG` a document title past 120. Neither number is anywhere a caller looks before writing: not in `--help`, not in `docs/cli.md`, not in `workfile schema --json` — the command the protocol sends agents to for valid values without guessing. The MCP `project_card_create` input schema carries `maxLength: 80` and is the only surface that does.

[[DOC-0006]]: seven of eleven creations in one session failed on this, each after the whole body had been composed. The body is not lost — the refusal happens before any write — but the call is, and a caller that learns a limit by being refused seven times has learnt to distrust the help.

Truncating with a warning was suggested. It is not taken: a title is the line the board shows, and a tool that shortens it silently decides for the author what the card is about. The limit is shown instead, where an agent already reads.

## Acceptance criteria

- [ ] `workfile schema --json` reports `cards.limits.title` = 80 and `docs.limits.title` = 120, read from the same constants the validators use.
- [ ] `workfile card --help` and `workfile doc --help` state the title limit on the `--title` usage line.
- [ ] `CARD_TITLE_TOO_LONG` and `DOC_TITLE_TOO_LONG` say how long the title was, not only what the maximum is.
- [ ] `docs/cli.md` names both limits where it documents `card create` and `doc create`.
