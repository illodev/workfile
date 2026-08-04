---
id: CHG-0105
title: The CLI reference names every command and alias the binary accepts
type: fixed
area: docs
visibility: public
cards: [T-0151]
created: 2026-08-04
updated: 2026-08-04
---

`docs/cli.md` documented what the binary rejects but not everything it
accepts. The `claude` family had no section — `workfile claude install`, the
command that writes the Claude Code surface into a repository, appeared only
as a cell in a flag table — and `workfile version` was the one top-level word
the reference never named.

Nine spellings resolved in the dispatcher and were documented nowhere:
`agents status`, `ci status`, `changelog create`, `memory create`, `claude sync`
and `mcp stdio`, plus the command words `docs`, `history` and `serve`. An alias
nobody documents is one nobody can rely on — it works, so somebody uses it, and
the only way to learn it is to read the dispatcher. They are now in an
"Accepted spellings" table, and a check requires every subcommand the binary
accepts to be named in the file.

Three configuration keys were documented in no document, no README and not the
example config: `cards.activityTrail`, `changelog.releasePrefix` and
`mcp.maxMessageBytes`. Each now sits where a reader would look for it — the
card file format, the release record format and a new Limits table in
`mcp.md` — and a second check requires every key in the schema to be named
somewhere.

Two more corrections came out of writing those. The spec showed a release
record as `id: REL-2026-07-28`; ids are sequential and 0.5.4 is `REL-0017`. And
the card file format omitted the `## Activity` section every card carries, so
the durable trail was undocumented in the section that defines the format.

`@illodev/workfile-search-local` documents its `dtype` option, which its README
listed nowhere despite the declarations carrying it.
