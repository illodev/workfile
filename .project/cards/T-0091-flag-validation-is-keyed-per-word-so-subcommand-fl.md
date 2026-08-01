---
id: T-0091
title: Flag validation is keyed per word, so subcommand flags drop silently
status: review
type: bug
priority: medium
area: core
created: 2026-08-01
updated: 2026-08-01
scope: [packages/workfile/bin/workfile.ts, packages/workfile/test/cli.test.ts, packages/workfile/docs/cli.md]
---
`COMMAND_FLAGS` was keyed per command **word**, not per subcommand —
`COMMAND_FLAGS.card` was a 35-flag union shared across fourteen subcommands —
and `assertKnownFlags` validated against that union. So every subcommand
accepted every sibling's flags and then ignored them.

Measured before the change, all exiting 0:

| command | what happened |
|---|---|
| `card patch ID --json-input p.json --title "SHOULD APPEAR"` | title silently discarded |
| `card create --tags a,b --tags c,d` | second flag dropped — `option()` uses `argv.indexOf` |
| `card show ID --status doing` | filter ignored |
| `doctor --folder nonsense` | ignored |
| `next --json-input p.json` | ignored |

And `docs/cli.md:171` asserted the opposite: "Options a command does not
recognise are refused with `CLI_ARGUMENT_UNKNOWN` rather than ignored."

## What shipped

**The table is per `"word subcommand"`.** All five now exit 1, and the message
names where the flag does belong: `Unknown option for "card patch": --title. It
belongs to \`card create\`, \`card note\`.`

**`CLI_ARGUMENT_CONFLICT` for a repeated flag.** `option()` reads the first
occurrence and drops the rest, so repeating one is an instruction that
evaporates. Refused, except `--check`/`--uncheck`, which `repeatedNumbers`
genuinely reads every time.

**The globals shrank to four** — `--root`, `--json`, `--dry-run`,
`--allow-new`. `--folder`, `--json-input`, `--expected-revision`, `--force`,
`--read-only` and `--yes` were global, which is exactly how `doctor --folder`
and `next --json-input` were accepted by code that never read them.

**No flag is read above its branches.** `cardCommand` read
`--expected-revision` once at the top, so `card list --expected-revision X` was
accepted and ignored, and no per-subcommand table could tell the difference. The
same for `--targets` in `agents`/`ci`, `--read-only` in `mcp` and
`--source`/`--mode` in `migrate`. A flag read unconditionally and used
conditionally is the whole defect in miniature, so the test asserts there are
none left.

**The dry-run guard was keyed per word too**, and refused `card reap --dry-run`
— which reads the flag and honours it — with a message naming `project card`, a
binary that has not existed since the rename. Both fixed. Found by smoke-testing
every command word after the change, not by the study.

## The test

The old guard checked one direction: every flag the CLI reads must be listed.
That is what caught `init` refusing its own `--areas`. It cannot catch a union,
because a union lists everything.

The new one derives, per subcommand, the flags that branch actually reads —
following calls into helpers, because `card list` never names `--status`,
`filterCards` does — and asserts three things: nothing read is missing from the
row, nothing listed is unread, and no flag is read above the branches at all.
It found the last loose read on its first run, and one stale table row after
that.

## Not done here

Every newly rejected form was verified to be a no-op today, one at a time. The
claim that this cannot break a caller is still an inference from the structure
rather than an exhaustive audit — the test's failure list is the audit, and it
came back empty.

## Acceptance criteria

- [x] Flags are validated per subcommand, not per command word
- [x] `card patch --json-input F --title X` is refused, and the message names where `--title` belongs
- [x] A repeated non-repeatable flag is refused with `CLI_ARGUMENT_CONFLICT`
- [x] `--check`/`--uncheck` still repeat
- [x] Only `--root`, `--json`, `--dry-run` and `--allow-new` are global
- [x] No flag is read above the branches that use it, asserted by a test
- [x] The test also asserts nothing listed is unread
- [x] `card reap --dry-run` works, and the refusal message names the real binary
- [x] Both tests fail on the code as it was
- [x] `docs/cli.md:171` becomes true

## Activity

- 2026-08-01 19:48Z illodev@local#e55eab30 · doing → review
