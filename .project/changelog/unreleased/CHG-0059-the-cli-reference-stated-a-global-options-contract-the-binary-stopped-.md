---
id: CHG-0059
title: The CLI reference stated a global-options contract the binary stopped honouring
type: fixed
area: docs
visibility: public
cards: [T-0098]
created: 2026-08-01
updated: 2026-08-01
---

`docs/cli.md` headed a table **Global options** and listed seven. Four of them
— `--expected-revision`, `--force`, `--read-only` and `--yes` — became
per-subcommand when the flag tables were re-keyed, and are refused with
`CLI_ARGUMENT_UNKNOWN` anywhere else. `--allow-new`, which is global, was
missing. The table now states what the binary enforces, names where the four
that moved actually apply, and spells out that `--dry-run` is accepted
everywhere and refused where it would have written anyway.

Two tests hold it: a documented flag must be global or listed for the
subcommand it is given to, and both option tables are compared against
`GLOBAL_FLAGS` and `COMMAND_FLAGS` directly.
