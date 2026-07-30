---
name: workfile
description: How to read and change Work, Docs, History and Memory in this repository. Load before touching anything under .project/.
---

This repository uses Workfile: Work, Docs, History and Memory
live as Markdown under `.project/`, and the CLI and MCP server are the
only supported way to change them.

Read before writing:

- `workfile card list --status doing` — what is already in flight.
- `workfile agents context --card <id>` — the relevant slice, bounded.

Never edit a file under `.project/` directly. The protocol takes a lock,
checks a revision and validates the result; a raw write skips all three
and silently corrupts the record for everyone else.

---

See .project/agents/protocol.md.
