---
id: T-0098
title: T-0091 narrowed the global flags and left cli.md stating the old contract
status: done
type: bug
priority: medium
area: docs
scope: [packages/workfile/docs/cli.md, packages/workfile/test/documentation.test.ts]
created: 2026-08-01
updated: 2026-08-02
related: [T-0088]
---

`docs/cli.md:16-26` has a table headed **Global options** listing seven. Two
are. Measured against the built binary with `card list`:

| documented as global | actual |
|---|---|
| `--root PATH` | global |
| `--json` | global |
| `--expected-revision REV` | `CLI_ARGUMENT_UNKNOWN` |
| `--force` | `CLI_ARGUMENT_UNKNOWN` |
| `--read-only` | `CLI_ARGUMENT_UNKNOWN` |
| `--yes` | `CLI_ARGUMENT_UNKNOWN` |
| `--dry-run` | `CLI_FLAG_UNSUPPORTED` unless the subcommand implements it |

And `--allow-new`, which *is* global (`GLOBAL_FLAGS`, bin/workfile.ts:225), is
missing from the table.

This is an aftershock of T-0091, which cut `GLOBAL_FLAGS` down to `--root`,
`--json`, `--dry-run`, `--allow-new`, `--help`, `-h` and re-keyed every other
flag per subcommand. That change made the CLI refuse what this table promises,
and the table was never updated with it. The four now-per-subcommand flags are
real and documented correctly further down the same file — the defect is the
heading they sit under.

Found by the T-0088 audit, which was looking for command paths and does not
read flags. Nothing in the suite compares a documented flag against
`COMMAND_FLAGS`, which is why a contract table could go stale in the same
commit that changed the contract.

## The fix

Rewrite the table to the four that are global, move the other four to the
subcommands that take them, and add `--dry-run`'s condition. Then extend the
T-0088 test with the flag direction: a flag documented in a fenced invocation
must appear in `COMMAND_FLAGS` for that subcommand or in `GLOBAL_FLAGS`. That
is the check that would have caught this at the time.

## Acceptance criteria

- [x] `cli.md`'s global table lists exactly what `GLOBAL_FLAGS` holds
- [x] A test fails when a doc gives a subcommand a flag it does not accept
- [x] The test fails on cli.md as it stands today

## Activity

- 2026-08-01 23:38Z illodev@local#e55eab30 · claimed
- 2026-08-01 23:45Z illodev@local#e55eab30 · doing → review
- 2026-08-02 00:22Z illodev@local#e55eab30 · review → done

