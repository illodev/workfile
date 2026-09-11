---
id: T-0247
title: A patch needs a show first, and a patch without a revision says nothing
status: review
type: idea
priority: medium
area: core
source: .project/docs/research/DOC-0006-field-report-a-fube-agent-s-session-on-the-workfile-cli-rela.md
tags: [cli, revision, design]
related: [DOC-0006]
raised: reported
created: 2026-09-11
updated: 2026-09-11
scope: [packages/workfile/bin/workfile.ts, packages/workfile/docs/cli.md, packages/workfile/test/cli.test.ts]
---

A `doc patch` — and `card patch`, `memory patch`, `changelog patch` — without `--expected-revision` applies unconditionally and says nothing. With it, the caller first runs `show --json` to obtain one field, and on a long document that is the whole body over the wire to read a hash.

[[DOC-0006]] suggested `--expected-revision latest`, which is the same as omitting the flag, or a warning when the flag is omitted. Neither is obviously right: the flag is optional by design, a warning on every unguarded write is noise to the caller who chose it, and a mandatory revision makes the one-call `--json-input` path two calls forever.

Options on the table, none chosen:

- `show --json --fields id,revision`, or a `revision` subcommand, so the read is cheap.
- a stderr note on an unguarded write saying what `--expected-revision` would have protected against.
- an `--if-unchanged-since TIMESTAMP` that reads the record's own `updated`.

## Acceptance criteria

- [x] `show --json --fields id,revision` answers with those keys and nothing else, on cards, docs, memory records and changelog records — the decision of 2026-09-11 on how a caller obtains a revision without the body
- [x] An unguarded patch applies and says nothing, and `docs/cli.md` says that is by design — the decision of 2026-09-11 on whether it announces itself

## Notes

- 2026-09-11 17:32Z illodev@local#597ecdc9 — Decided by the owner on 2026-09-11: a caller obtains a revision without the body through show --fields id,revision on every record kind, and an unguarded patch does not announce itself — the flag is optional by design, a note on every write nobody asked to guard is noise, and the --json result of a patch already carries the new revision. No --if-unchanged-since.
- 2026-09-11 17:37Z illodev@local#597ecdc9 — Shipped as projectShown() in bin/workfile.ts: card, doc, memory and changelog show accept --fields, the same flag list already had, and a key the record does not carry is left out rather than reported null. Pinned by the cli.test.ts case 'show --fields cuts a record of any kind down to the keys named' across the four kinds, plus the unchanged whole-record default. cli.md documents both decisions in the listing section. Evidence for done is the published package answering show --fields id,revision on each kind; that rides 0.13.0 with T-0246, whose --fields on transition/patch reuses this projection.

## Activity

- 2026-09-11 17:37Z illodev@local#597ecdc9 · claimed
- 2026-09-11 17:38Z illodev@local#597ecdc9 · released
