---
id: T-0100
title: A bare command word skips flag validation and runs anyway
status: backlog
type: bug
priority: medium
area: core
scope: [packages/workfile/bin/workfile.ts]
related: [T-0091, T-0098]
created: 2026-08-01
updated: 2026-08-01
---

`assertKnownFlags` keys on `"word subcommand"`, falls back to `word`, and
returns without checking anything when neither is in `COMMAND_FLAGS`
(bin/workfile.ts:675-678). Nine words have no table of their own — `agents`,
`card`, `changelog`, `ci`, `claude`, `doc`, `mcp`, `memory`, `migrate` — and for
six of them the dispatcher then reports the missing subcommand, so nothing is
lost.

Three of them run something instead. Measured against the built binary in a
fresh workspace:

| invocation | what happens |
|---|---|
| `workfile mcp --nonsense` | serves |
| `workfile migrate --nonsense` | runs `migrate apply`, stopped only because `.planning` was absent |
| `workfile claude --nonsense` | prints the surface report, exit 0 |
| `workfile claude --force` | prints the surface report, exit 0, `--force` discarded |

Spelling the same subcommand out is refused correctly: `workfile migrate apply
--nonsense` answers `CLI_ARGUMENT_UNKNOWN`. The check exists; the bare form
dodges it.

This is the failure T-0091 set out to remove, surviving in the one place its
fix could not see. Its own comment names it: silent flag-dropping is the worst
shape for an agent, because the instruction evaporates and the exit code says
it worked. `workfile migrate --source other-dir` is the case with teeth — the
flag is real for `migrate apply`, the bare form ignores it, and the migration
runs against `.planning` regardless.

Found while writing the flag-direction test for T-0098, which had to resolve
`mcp` to `mcp serve` by hand to check `workfile mcp --read-only` against what
the command actually does rather than against the hole.

## The fix

Resolve the default subcommand before validating, from one table the
dispatcher and the guard share, so `mcp` checks as `mcp serve`, `migrate` as
`migrate apply` and `claude` as whatever bare `claude` runs. A word that
genuinely takes no subcommand and no flags should say so explicitly rather
than by absence.

Then delete `DEFAULT_SUBCOMMAND` from documentation.test.ts and read the shared
table instead — while the guard has the hole, the test has to duplicate the
knowledge to stay honest.

## Acceptance criteria

- [ ] `workfile mcp --nonsense`, `workfile migrate --nonsense` and `workfile claude --nonsense` are refused with `CLI_ARGUMENT_UNKNOWN`
- [ ] `workfile mcp --read-only` still serves read-only
- [ ] A test covers every word with no table of its own, not only the three that run
- [ ] documentation.test.ts reads the default-subcommand table instead of declaring one
