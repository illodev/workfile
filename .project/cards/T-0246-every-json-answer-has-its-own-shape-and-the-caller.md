---
id: T-0246
title: Every --json answer has its own shape, and the caller guesses the key
status: backlog
type: idea
priority: medium
area: core
source: .project/docs/research/DOC-0006-field-report-a-fube-agent-s-session-on-the-workfile-cli-rela.md
tags: [cli, json, design]
related: [DOC-0006]
raised: reported
created: 2026-09-11
updated: 2026-09-11
---

Measured on 0.10.0:

| command | `--json` returns |
| --- | --- |
| `card create` | the card |
| `card claim` | `{record, warnings}` |
| `card transition`, `card patch`, `card release` | the card, body included |
| `card list`, `doc list` | `{records, total}` |
| `doc show` | the index record, with `outgoing`, `incoming`, `freshness` |
| `doc patch`, `doc create` | the normalised document |
| `doctor` | `{generatedAt, cards, modules, counts, ok, issues}` |

[[DOC-0006]]'s caller ended up reading every answer with `d.get("record", d)`, which works until a command returns `{records}`. The MCP has one envelope (`RECORD_RESULT` = `{record}` plus named extras); the CLI grew each shape when the command did.

The report also asked for a `--quiet` on `card transition`, because the full card is several KB on a long one. Without `--json` the output is already one line, `T-0003 → next`; what is missing is a machine-readable form that is not the whole record.

Not decided here: whether the CLI adopts the MCP envelope, what a compatibility window looks like for callers parsing the current shapes, and whether the answer is an envelope or a documented table of shapes in `docs/cli.md`. Either way the shapes are written down.

## Acceptance criteria

- [ ] `docs/cli.md` has a table of what every `--json` command returns, pinned by a test so it cannot drift.
- [ ] A decision is recorded on whether the CLI converges on the MCP envelope and, if so, how existing callers are told.
- [ ] `card transition --json` has a form that returns id, status and revision without the body, or the decision says why not.
