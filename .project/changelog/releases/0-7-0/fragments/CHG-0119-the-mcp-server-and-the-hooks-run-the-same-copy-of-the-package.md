---
id: CHG-0119
title: The MCP server and the hooks run the same copy of the package
type: fixed
area: mcp
visibility: public
created: 2026-08-05
updated: 2026-08-05
---
`workfile claude install` wrote two artifacts, in the same command and seconds
apart, that could run different versions of this package:

```
// .mcp.json — whatever npm publishes today
"command": "npx", "args": ["-y", "@illodev/workfile", "mcp"]

// .claude/settings.json — whatever the repository has installed
"command": "node node_modules/@illodev/workfile/dist/.../hooks.mjs …"
```

In a repository pinned to 0.5.2 the MCP server was 0.5.4 and the hooks were
0.5.2. An external field report called this the finding easiest to miss and the
one that caused most confusion, which is the right reading: the two halves of
the Claude Code surface disagree about what the protocol is, and every symptom
of that looks like something else. This repository was in that state — the one
that develops the tool was talking to the published copy.

Where the package is a dependency, `.mcp.json` now registers it:

```json
{ "command": "node", "args": ["node_modules/@illodev/workfile/dist/bin/workfile.js", "mcp"] }
```

on the same assumption the hooks already make — the client starts the server
from the project directory. It is also one fewer network fetch on a tool whose
argument is that the repository is the database.

**A workspace with no local install keeps the `npx` form**, which is what it is
for. Re-running `install` follows the dependency in either direction, so adding
or dropping it settles on the next sync.

**`upgrade` reports a binary that is not the one the workspace will run:**

```
$ workfile upgrade
Workfile upgrade → v0.6.0
  MISMATCH      this binary is v0.6.0, node_modules has v0.5.2 — the hooks and
                the MCP server run the local copy, so install v0.6.0 there or
                upgrade with the local binary
```

That is the shape `pnpm i -g @illodev/workfile` produces against a repository
pinning an older release: the global binary regenerates every managed file and
stamps its own version into headers the local copy will never match, while the
surface reports current throughout. Both halves were always knowable at that
moment — the running process knows its version, the workspace's copy states its
own — so the command says so instead of leaving it to be found.
