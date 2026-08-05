---
id: CHG-0125
title: claude check compares the generated JSON instead of counting the file
type: fixed
area: mcp
visibility: public
created: 2026-08-05
updated: 2026-08-05
cards: [T-0177]
---
`claude check` reported `.mcp.json` and `.claude/settings.json` as `current`
whenever the files existed. The five managed Markdown files are digested and
compared byte for byte; these two are merged into files the repository also
owns, so they carry no marker to hold a digest and were checked by existence
alone.

That gap became load-bearing in 0.6.0, when `.mcp.json` started registering the
workspace's own copy of the package where there is one and the portable form
where there is not. The correct content now depends on the workspace, a
workspace that gains or loses the dependency keeps whichever form it had, and
the first symptom was an MCP server running a version nobody chose.

The ledger at `.project/generated/claude-code.json` already recorded which keys
this tool writes, and now records them at the depth the merge actually works
at — `mcpServers.workfile` rather than `mcpServers` — so ownership is per
entry rather than per file:

- A generated value that no longer matches what an install would write is
  reported, and named: `stale .mcp.json (mcpServers.workfile)`.
- A server, permission or hook the repository added beside it is not compared,
  not reported and not removed by the repair.
- Values, not bytes: the file belongs to the repository, so its formatting and
  key order are not this tool's to have an opinion about.

The same change fixes removal. A key this tool stopped generating used to be
deleted whole, taking any sibling the repository had put in the same object;
now the entry goes and the object survives unless emptying it left nothing.
