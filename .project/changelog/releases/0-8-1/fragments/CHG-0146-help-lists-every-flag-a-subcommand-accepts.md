---
id: CHG-0146
title: --help lists every flag a subcommand accepts
type: fixed
area: core
visibility: public
cards: [T-0215]
created: 2026-08-07
updated: 2026-08-07
---

`workfile <word> --help` now lists every flag each of its subcommands accepts,
under the usage lines. The list is generated from the dispatcher's own table, so
it cannot fall behind what the binary does.

It had fallen a long way behind. The usage lines name the shape of a command and
are curated by hand, and 93 of the 232 accepted flags appeared nowhere. Among
them `--body` and `--json-input` on `doc create`, `changelog add` and
`memory add` — the only way to write a record's body in the same call that
creates it. `card create` documented `--json-input` and the other three did not,
so the help read as if they could not do it.

Those three now carry the same curated line `card create` has. A test fails if
any accepted flag is missing from its command's help.
