---
id: CHG-0093
title: Slash commands carry their description and their tool grant again
type: fixed
area: core
visibility: public
created: 2026-08-02
updated: 2026-08-02
cards: [T-0134]
---
The generated frontmatter interpolated its values instead of quoting them, so
two commands shipped YAML that does not parse: `/claim` carried
`argument-hint: [T-0042] [scope,paths]`, a flow sequence with content after
it, and `/done` carried `description: Finish a card: verify, record, release`,
whose plain scalar ends at the second colon.

A command whose frontmatter fails to parse loads with no metadata at all, so
both reached the model without their description and without the
`allowed-tools` grant that names the one subcommand each needs.

Values are now emitted as quoted scalars. `argument-hint` also stops parsing
as a one-element array, which it did wherever it happened to be valid.

Re-run `workfile claude install` to pick this up; `workfile claude check`
reports the installed files as stale until you do.
