---
id: T-0153
title: mcp.md says .mcp.json registers workfile-mcp; it has not since 0.4.0
status: done
type: bug
priority: medium
area: mcp
created: 2026-08-04
updated: 2026-08-04
scope: [packages/workfile/docs/mcp.md, packages/workfile/test/documentation.test.ts]
---

`docs/mcp.md:52` describes what `workfile claude install` writes:

| File | What it does |
|---|---|
| `.mcp.json` | Registers `workfile-mcp` — the binary that parses its own flags |

It does not. `claudeMcpFile()` generates, and the committed `.mcp.json` and the
marketplace plugin both carry:

```json
{ "command": "npx", "args": ["-y", "@illodev/workfile", "mcp"] }
```

T-0116 changed it at e6a1484 — "The marketplace plugin registers an MCP server
that starts", shipped in 0.4.0 — because `workfile-mcp` is a bin `npx` cannot
select from a package spec, so the server answered every request with the CLI
help on stdout. The row describing the old behaviour was not updated with it,
and it is the row a reader consults to find out what the install did.

The `workfile-mcp` bin still exists and still parses its own flags. It is simply
not what the generated configuration registers, which makes the sentence
plausible enough to survive a reread.

## Why no test caught it

"every stated MCP invocation agrees with the generated one" already compares
`claudeMcpFile()` against both READMEs and `server.json` — T-0116's own
regression test, written because three hand-written copies of that string had
drifted. `docs/mcp.md` is a fourth copy and is not in the comparison, because
the check parses a fenced ```json block with an `mcpServers` key and this copy
is prose in a table cell.

## The fix

Correct the row to name the invocation that ships. Then decide whether the
existing check can reach it: a table cell is not a JSON block, so either mcp.md
states the configuration as a fenced block like the READMEs do — and joins the
comparison for free — or the check learns to resolve any backticked
`workfile-mcp` / `@illodev/workfile` span in the documented set against the
generated args. Prefer the first; it removes the fourth copy instead of
pinning it.

Discovered while documenting the `claude` command family for T-0151, whose
scope does not include mcp.md.

## Acceptance criteria

- [x] The row names the invocation `claudeMcpFile()` actually generates
- [x] mcp.md's copy of the configuration is covered by a check, or removed
- [x] The check fails on the row as it stands
- [x] `pnpm run check` green, doctor 0/0

## Activity

- 2026-08-04 19:38Z illodev@local#cfe281b4 · claimed
- 2026-08-04 19:40Z illodev@local#cfe281b4 · doing → review
- 2026-08-04 20:32Z illodev@local#cfe281b4 · review → done

## Notes

- 2026-08-04 19:40Z illodev@local#cfe281b4 — Fixed and verified locally. The table row now points at a fenced block carrying the real invocation, and mcp.md joined the existing claudeMcpFile comparison rather than getting a rule of its own — perturbing the block to @illodev/workfile-mcp fails the check with 'docs/mcp.md and claudeMcpFile disagree about how to start the server', so the comparison is reading this copy and not passing on the READMEs alone.

Checked the neighbouring claim while here: 'workfile mcp config emits the Node executable, the workfile-mcp binary, workspace root…' is accurate — mcp config --json returns that bin with --root. Only the .mcp.json row was wrong.

13 checks in documentation.test.ts, suite 275/275, pnpm run check exit 0, ratchet 554/56 none new, doctor 0/0. Not verified on Windows; stays in review until CI is green. Uncommitted.
- 2026-08-04 20:29Z illodev@local#cfe281b4 — CI green on all eight matrix jobs at 86be3c0 (PR #14, run 30947778231): ubuntu, macos and windows on node 22 and 24, plus smoke, codeql and doctor. Windows 22 in 1m59s, Windows 24 in 3m42s. That closes the platform gap every note above flagged — the checks resolve paths through new URL against a document base, and Windows checkouts are where that has broken before.

Staying in review rather than done: the protocol reads review as 'awaiting verification, deployment or approval', and this is awaiting approval. The runtime evidence exists; the merge does not.
