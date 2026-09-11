---
id: T-0242
title: A --flag=value spelling passes the flag check and is never read
status: review
type: bug
priority: high
area: core
source: .project/docs/research/DOC-0006-field-report-a-fube-agent-s-session-on-the-workfile-cli-rela.md
tags: [cli, flags, revision]
scope: [packages/workfile/bin/workfile.ts, packages/workfile/test/cli.test.ts, packages/workfile/docs/cli.md]
related: [DOC-0006]
raised: reported
created: 2026-09-11
updated: 2026-09-11
---

`assertKnownFlags` reads a token's name as the part before `=`, so `--expected-revision=REV` is a known flag and passes. `option()` then looks for the exact token `--expected-revision` in argv, finds nothing, and returns null. The command runs as if the flag had not been given, exit 0.

Measured on `main` at 0.10.0, fixture workspace, `doc patch DOC-0001`:

| spelling | outcome |
| --- | --- |
| `--expected-revision sha256:deadbeef` | `DOC_WRITE_CONFLICT`, exit 3 |
| `--expected-revision=sha256:deadbeef` | `DOC-0001 updated`, exit 0 |

This is what [[DOC-0006]] reports as "a truncated revision applied anyway": the revision was not compared at all. The same hole is under every value-taking flag — `--title=`, `--actor=`, `--status=`, `--scope=`, `--json-input=` — because `option()`, `listOption()`, `numberOption()` and `axisOptions()` all read argv the same way. `--actor=bot` claims as the session; `--status=next` on `card release` releases to the default.

The validator and the reader parse the same input with two grammars. One of them has to give: either the reader understands `=`, or the validator refuses it. Refusing is the smaller change and the wrong one — `--flag=value` is what every other CLI accepts, and a caller who wrote it once will write it again.

## Acceptance criteria

- [x] `option()` returns the value of `--name=value` as well as `--name value`, and `listOption`, `numberOption` and `axisOptions` inherit it.
- [x] `doc patch ID --json-input F --expected-revision=sha256:deadbeef` is refused with `DOC_WRITE_CONFLICT`, pinned by a CLI test that runs the built binary.
- [x] A boolean flag given a value (`--json=true`) is refused with `CLI_ARGUMENT_INVALID` rather than silently read as absent.
- [x] `docs/cli.md` says both spellings are accepted, in the section that states the option rules.

## Activity

- 2026-09-11 15:17Z illodev@local#597ecdc9 · claimed
- 2026-09-11 15:21Z illodev@local#597ecdc9 · doing → review

## Notes

- 2026-09-11 15:21Z illodev@local#597ecdc9 — Fixed in bin/workfile.ts: one valuesOf() walk serves option(), has(), repeatedNumbers(), repeatedOption() and axisOptions(); assertKnownFlags refuses a value on a boolean flag. Local evidence: cli.test.ts 'a --flag=value spelling is read, not only admitted' passes on the built binary; on a scratch workspace doc patch --expected-revision=sha256:deadbeef now answers DOC_WRITE_CONFLICT exit 3 where it wrote and exited 0 before; --json=true answers CLI_ARGUMENT_INVALID; --actor=probe-bot claims as probe-bot. Missing: the published package in a consumer.
