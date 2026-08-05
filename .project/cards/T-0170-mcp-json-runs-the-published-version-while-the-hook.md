---
id: T-0170
title: .mcp.json runs the published version while the hooks run the local one
status: done
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

- [x] `.mcp.json` runs the workspace's installed copy when there is one
- [x] A workspace with no local install still gets a working MCP registration
- [x] `upgrade` reports a mismatch between the running binary and the local one
- [x] The two artifacts are covered by a test that asserts they agree

## Activity

- 2026-08-05 12:15Z illodev@local#2cddaf94 · claimed
- 2026-08-05 12:24Z illodev@local#2cddaf94 · doing → review
- 2026-08-05 17:20Z illodev@local#2cddaf94 · review → done

## Notes

- 2026-08-05 12:24Z illodev@local#2cddaf94 — The decision the card carried — whether preferring the local copy should fall back to `npx` — resolves yes, and criterion #2 was already the reason: a workspace that only ever used the global binary has nothing on disk to prefer, and a registration that does not start is worse than one that fetches. So `.mcp.json` prefers what is installed and falls back to `npx -y`, and re-running `install` follows the dependency in either direction.

Verified on this repository, which was in the reported state: `node_modules/@illodev/workfile` is a link to `packages/workfile`, and `.mcp.json` was fetching the published copy — the repository that develops the tool talking to a different build of it. `claude install` rewrote it. The mismatch report was driven on a scratch workspace pinned to 0.5.2 against this 0.6.0 binary, which is the field report's exact scenario.

Two things this uncovered, both filed rather than folded in. [[T-0177]]: `claude check` reports the two JSON artifacts by existence alone, so the correct content now depends on the workspace and nothing compares it — the ledger already records which keys are ours, so it is knowable. [[T-0178]]: the hooks have no portable form at all, so in the npx-only workspace the two artifacts still cannot agree — the server starts and the hooks name a file that is not there. That one carries a latency question, since `PreToolUse` runs before tool calls and its whole design rests on not paying to resolve a package.
- 2026-08-05 17:20Z illodev@local#2cddaf94 — Runtime evidence: merged to main in PR #22 (fea0cff..bda003c) and verified by the full CI matrix on the merge commit — ubuntu, macos and windows on node 22 and 24, plus smoke, doctor and codeql, all green. 328 tests + 7 search-local, strict ratchet held at 494.
