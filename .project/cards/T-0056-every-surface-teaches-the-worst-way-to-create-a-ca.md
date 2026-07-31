---
id: T-0056
title: Every surface teaches the worst way to create a card
status: backlog
type: docs
priority: high
area: docs
source: .project/docs/research/DOC-0001-fube-session-feedback-verified-triage.md
tags: [fube-feedback, discoverability, agent-experience]
scope: [packages/workfile/bin/workfile.ts, packages/workfile/docs/cli.md, README.md]
created: 2026-07-31
updated: 2026-07-31
---

`card create` already reads `--json-input FILE`, and `createCard`
(`src/modules/cards/mutations.ts:272-293`) accepts `parent`, `source`, `tags`,
`scope`, `depends`, `milestone`, `effort`, `related`, `start`, `due` and `body`.
One call writes a complete card, body included, with accents, backticks and `$`
intact. `--body`, `--tags` and `--scope` work as plain flags too.

`--json-input` on `card create` appears exactly once in the entire documentation
corpus: `packages/workfile/docs/SPEC.md:1345`. It is absent from:

- `card --help` and the root usage banner (`bin/workfile.ts:90`)
- `packages/workfile/docs/cli.md:88`
- the README

All three show `card create --title TITLE [--area AREA] [--type TYPE]
[--priority PRIORITY]` and stop there.

A reporting agent consequently built every card in three calls — `create`, then
`patch --json-input`, then `write --body-file` — and wrote bodies through bash
heredocs, where backticks and `$` in code references corrupted content silently.
It filed the asymmetry as "the CLI needs three calls, MCP needs one". The CLI
needs one. Nothing ever told it so.

## Scope

The usage line is the fix, not a new document. `card create` should show the
`--json-input` form and name it as the way to create a card with a body. The same
review applies to every command whose documented form is not its best form.

The reporter's own framing is the acceptance criterion: `--help` should teach the
recommended path, not just enumerate syntax. Today you have to fail to find out
what the tool can do.

Related: [[T-0052]] covers the flags that are genuinely missing rather than
merely undocumented.
