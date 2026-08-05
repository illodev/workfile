---
id: T-0170
title: .mcp.json runs the published version while the hooks run the local one
status: backlog
type: bug
priority: medium
area: mcp
tags: [install, versioning, field-report]
origin: [DOC-0005]
created: 2026-08-05
updated: 2026-08-05
---

`workfile claude install` writes two artifacts that can run different versions
of this package, and nothing says so. Reported in [[DOC-0005]] (finding 7) and
confirmed at 0.6.0 — both files below were generated in the same command, in
the same workspace, seconds apart:

```
// .mcp.json — whatever npm publishes today
"command": "npx", "args": ["-y", "@illodev/workfile", "mcp"]

// .claude/settings.json — whatever the repository has installed
"command": "node node_modules/@illodev/workfile/dist/src/runtime/claude/hooks.mjs …"
```

In a repository pinned to 0.5.2, the MCP server is 0.5.4 and the hooks are
0.5.2. The tester hit exactly that and called it the finding easiest to miss
and the one that caused most confusion, which is the right reading: the two
halves of the Claude Code surface disagree about what the protocol is, and
every symptom of that looks like something else.

`npx -y` is also a network fetch on a tool whose whole argument is that the
repository is the database. A workspace with the package installed already has
the answer on disk.

The report attaches a second half that is really about `upgrade`, not about
`.mcp.json`. The documentation recommends installing as a devDependency, while
the update instructions in circulation are `pnpm i -g @illodev/workfile` and
`wf upgrade`. Run that way, the global binary regenerates every managed file
and stamps its own version into headers the local hooks will never match. The
mismatch is detectable — the running binary knows its version and the
workspace's `node_modules` copy states its own — so `upgrade` can say so
instead of leaving it to be discovered.

Not established: whether preferring the local copy should fall back to `npx`
when the package is absent, which is the case for a workspace that only ever
used the global binary. That is the one decision this card carries.

## Acceptance criteria

- [ ] `.mcp.json` runs the workspace's installed copy when there is one
- [ ] A workspace with no local install still gets a working MCP registration
- [ ] `upgrade` reports a mismatch between the running binary and the local one
- [ ] The two artifacts are covered by a test that asserts they agree
