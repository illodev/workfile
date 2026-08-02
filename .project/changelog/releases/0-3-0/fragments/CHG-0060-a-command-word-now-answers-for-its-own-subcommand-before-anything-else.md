---
id: CHG-0060
title: A command word now answers for its own subcommand before anything else
type: fixed
area: core
visibility: public
cards: [T-0095, T-0100]
created: 2026-08-02
updated: 2026-08-02
---

Nine words branch, and they answered three different ways. `card` and `doc`
demanded an identifier first, so `workfile doc index` replied `doc index
requires an ID` — pointing a reader at an identifier for a subcommand that does
not exist. Six interpolated a missing subcommand into the message and printed
the literal `card undefined requires an ID`. Three ran a default with nothing
checked: `workfile mcp --nonsense` served, `workfile migrate --nonsense` ran
the import and `workfile claude --force` exited 0 having discarded the flag,
while the same commands spelled out were refused correctly.

One guard now answers for all of them, from the dispatch table rather than a
second list: an unknown subcommand is `CLI_COMMAND_UNKNOWN` and a missing one
`CLI_COMMAND_REQUIRED`, both naming what the word accepts. `claude`, `mcp` and
`migrate` declare the subcommand their bare form runs and are validated as
though it had been typed, which also restores `workfile migrate --dry-run` —
refused as unimplemented while `workfile migrate apply --dry-run` previewed.

`serve` became a real alias of `ui`: it reached none of these guards, so
`workfile serve --help` printed the whole banner and `workfile serve
--nonsense` started the server.

Positional arguments no longer accept a flag standing in for a missing value.
`workfile card show --json` answered `Card not found: --json`; it now says the
ID is missing, as do the four other subcommands that were looking up the
record `undefined`.
