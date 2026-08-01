---
id: T-0091
title: Flag validation is keyed per word, so subcommand flags drop silently
status: backlog
type: bug
priority: medium
area: core
created: 2026-08-01
updated: 2026-08-01
---
`COMMAND_FLAGS` is keyed per command *word*, not per subcommand — `COMMAND_FLAGS.card`
is a 35-flag union shared across roughly fourteen subcommands — and
`assertKnownFlags` (`bin/workfile.ts:410`) validates against that union. So a
flag that belongs to a sibling subcommand is accepted and ignored.

Measured on a scratch workspace, all exiting 0:

| command | what happened |
|---|---|
| `card patch T-x --json-input p.json --title "SHOULD APPEAR"` | title silently discarded; only the JSON applied |
| `card create --tags a,b --tags c,d` | second flag dropped — `option()` uses `argv.indexOf` |
| `card show T-x --status doing` | filter ignored |
| `doctor --folder nonsense` | ignored |
| `next --json-input p.json` | ignored |

And `docs/cli.md:171` asserts the opposite: "Options a command does not
recognise are refused with `CLI_ARGUMENT_UNKNOWN` rather than ignored."

Silent flag-dropping is the worst failure shape for an agent, which cannot
notice that its instruction evaporated.

## The fix

Key `COMMAND_FLAGS` per (word, subcommand). Add `CLI_ARGUMENT_CONFLICT` for the
case where a flag *is* known to the subcommand but loses to another —
`--json-input` together with a field flag on any patch, and any repeated
`option()`/`listOption()` flag.

Drop the `--append-*` twins the originating item proposed: `--json-input -`,
`card write --body-file` and `repeatedNumbers()` already cover multi-line and
repeatable input.

Technically breaking, but every newly rejected form is a no-op today — which is
an inference from the structure, not an exhaustive audit. Build the test first
and read its failure list before deciding.

## Acceptance criteria

- [ ] Flags are validated per subcommand, not per command word
- [ ] `card patch --json-input F --title X` is refused rather than silently partial
- [ ] A repeated `option()` flag is refused instead of dropping all but the first
- [ ] `test/cli.test.ts:656` also asserts the reverse direction: every flag a subcommand accepts is read by it
- [ ] The list of newly-rejected forms is reviewed and recorded before the change lands
- [ ] `docs/cli.md:171` becomes true
