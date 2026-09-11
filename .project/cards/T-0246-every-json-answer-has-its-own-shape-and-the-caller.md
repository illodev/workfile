---
id: T-0246
title: Every --json answer has its own shape, and the caller guesses the key
status: done
type: idea
priority: medium
area: core
source: .project/docs/research/DOC-0006-field-report-a-fube-agent-s-session-on-the-workfile-cli-rela.md
tags: [cli, json, design]
related: [DOC-0006]
raised: reported
created: 2026-09-11
updated: 2026-09-11
scope: [packages/workfile/bin/workfile.ts, packages/workfile/docs/cli.md, packages/workfile/test/cli.test.ts, packages/workfile/test/documentation.test.ts]
verified:
  at: "2026-09-11T19:04:07.658Z"
  method: manual
  commit: ba2fed3185303fa5776b36a82f2f1ff60125a544
  digest: "sha256:b923c996f3b6abee907cfe3244232a0d4777a91d59dffcc7808111a9fbd0bdef"
produced_by:
  model: claude-fable-5-1
  reasoning: xhigh
  basis: self-reported
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

- [x] `docs/cli.md` has a table of what every `--json` command returns, pinned by a test so it cannot drift.
- [x] The decision is recorded — the CLI converges on the MCP envelope in 0.13.0 (owner, 2026-09-11) — and callers are told three ways today: the table in `docs/cli.md`, a stderr line once per process on every record answer naming the version and the new shape, and `WORKFILE_JSON_ENVELOPE=1` to opt into the envelope now
- [x] `card transition --json --fields id,status,revision` answers with those keys and no body, in either shape, and every other record answer takes `--fields` the same way

## Notes

- 2026-09-11 17:32Z illodev@local#597ecdc9 — Decided by the owner on 2026-09-11: the CLI converges on the MCP envelope in 0.13.0 — every --json answer becomes { record } for one record and { records, total } for a list, the same shape project_* tools return — as a breaking change announced in the changelog and on stderr during 0.12.x. Criterion 3 rides the same change: transition/patch/release accept --fields id,status,revision so a caller gets the envelope without the body. Criterion 1 (the table in cli.md, pinned by a test) ships with it.
- 2026-09-11 17:46Z illodev@local#597ecdc9 — Shipped in three parts. (1) docs/cli.md has a 'Machine-readable answers' section with the four-shape vocabulary and a table of every --json subcommand, pinned by the cli.test.ts case that parses the table, checks every named command against the dispatcher and runs all 24 record-answering commands in both shapes on a fresh workspace. (2) recordAnswer() in bin/workfile.ts: the legacy shape prints with one stderr line per process naming 0.13.0 and the new shape; WORKFILE_JSON_ENVELOPE=1 opts into { record, …extras } today; claim and the listings do not change and say nothing. (3) --fields applies to every record answer through the same projection show got in T-0247, so transition --json --fields id,status,revision is the body-less form. The flip itself is T-0250, bound to 0.13.0, because a 0.12.x cannot ship a breaking default.
- 2026-09-11 19:04Z illodev@local#597ecdc9 — manual verification: Published in @illodev/workfile@0.12.1 (npm dist-tag latest, GitHub Release v0.12.1, 2026-09-11 19:02Z). Consumer verification from the registry (verify-consumer-0.12.1.sh, 20/20): a record answer (card show --json) carries the 0.13.0 note on stderr, a listing carries none, WORKFILE_JSON_ENVELOPE=1 answers { record } with the card inside and silences the note; docs/cli.md ships the shape table; the pinned test runs 24 record commands in both modes. The default flip is T-0250 (0.13.0).

## Activity

- 2026-09-11 17:39Z illodev@local#597ecdc9 · claimed
- 2026-09-11 17:46Z illodev@local#597ecdc9 · released
- 2026-09-11 19:04Z illodev@local#597ecdc9 via:claude-fable-5-1/xhigh · review → done
