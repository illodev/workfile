---
id: T-0215
title: --help names 139 of the 232 flags the CLI accepts
status: review
type: bug
priority: high
area: core
created: 2026-08-07
updated: 2026-08-07
---

`--help` documents 139 of the 232 flags the dispatcher accepts. The usage lines
are curated prose, they name the *shape* of a command, and 93 flags were named
nowhere at all.

Among the missing: `--body` and `--json-input` on `doc create`, `changelog add`
and `memory add` — the only way to write a record's body in the call that
creates it. `card create` documented `--json-input`; the other three did not,
which reads as a statement about those commands rather than about the help.

The consequence is not cosmetic. The reasonable move after reading that help is
to create the record empty and then open the file. Under Claude Code that is an
`Edit` inside `.project/`, and the protocol hook stops to ask about every one of
them — a hook `ask` outranks `bypassPermissions`, so there is no permission mode
that escapes it either. A consuming repository reported this as "every time you
touch a doc it asks me to accept the change", and nothing about that symptom
points back at a missing line in `--help`.

Three existing tests ask whether what the documentation teaches is real. None
asked whether what is real is taught.

## Acceptance criteria

- [x] `workfile <word> --help` prints every flag each of its subcommands
      accepts, generated from `COMMAND_FLAGS` so it cannot drift.
- [x] The three record creators get a curated usage line for `--json-input`,
      matching the one `card create` already had, in `--help` and in cli.md.
- [x] A test fails if any accepted flag is absent from its word's `--help`.
- [x] Full suite green.

## Notes

Reported from Fube on 2026-08-07, where it had been costing one permission
dialog per protocol record.

## Activity

- 2026-08-07 10:04Z illodev@local#bada1057 · backlog → review
