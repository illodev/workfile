---
id: CHG-0145
title: workfile ui gains --read-only and --allowed-host, so a board can be published for reading
type: added
area: core
visibility: public
created: 2026-08-06
updated: 2026-08-06
---

`workfile ui --read-only` serves the board with the workspace loaded read-only:
every mutating route answers `409 WORKSPACE_READ_ONLY` through the same
`ensureWritable` guard the MCP server uses, the index cache is not written, and
the UI stands its editing affordances down and shows a `read-only` chip.
`--read-only` now also reaches the workspace on `workfile mcp`, which until now
hid the mutation tools while leaving it writable.

`workfile ui --allowed-host HOST` (repeatable, comma-separable, `*` to disable
the check) names the hosts the board may answer to. It is required to publish
one: the origin guard refuses any `Host` outside its allowlist, and that list
was the loopback set plus `--host` — which contributes nothing when `--host` is
`0.0.0.0`, the value serving from a container needs. Named hosts are added to
the loopback set rather than replacing it, so a container healthcheck keeps
working.

Related: `startProjectServer` reported `http://0.0.0.0:PORT` for a wildcard
bind, an address the server itself refuses. It reports loopback now.

Neither flag adds authentication — there is none to add. A published board
serves every record to whoever can reach it, so it needs a proxy that
authenticates in front of it. See `docs/security.md`.

