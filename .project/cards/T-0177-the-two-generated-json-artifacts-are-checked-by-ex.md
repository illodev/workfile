---
id: T-0177
title: The two generated JSON artifacts are checked by existence, not by content
status: done
type: bug
priority: medium
area: mcp
created: 2026-08-05
updated: 2026-08-05
scope: [packages/workfile/src/modules/claude]
---

`checkClaudeSurface` reports `.mcp.json` and `.claude/settings.json` as
`current` whenever the file exists:

```js
files.push({
    path: entry.label,
    status: (await exists(entry.path)) ? "current" : "missing"
});
```

The five managed markdown files are digested and compared byte for byte. These
two are not, because they are merged into files the repository also owns and
carry no marker to hold a digest.

[[T-0170]] made the gap concrete. `.mcp.json` now registers the local copy of
the package when there is one, and the portable `npx` form when there is not —
so the correct content depends on the workspace, and a workspace that gains or
loses the dependency after `claude install` keeps whichever form it had. `claude
check` calls it current, and the first symptom is the MCP server running a
version nobody chose. A hand-edited hook command is the same story.

The subtree is knowable without claiming the whole file: `mergeJson` already
records which keys are generated, in `.project/generated/claude-code.json`, and
that ledger exists so that removing a key later actually removes it. The same
record says exactly which values are ours to compare.

## Acceptance criteria

- [x] `claude check` reports a generated key whose value drifted from what install would write
- [x] Keys the repository owns in the same file are not compared and not reported
- [x] A workspace that gains or loses the local dependency is reported before the next install

## Activity

- 2026-08-05 15:17Z illodev@local#2cddaf94 · claimed
- 2026-08-05 15:36Z illodev@local#2cddaf94 · doing → review
- 2026-08-05 17:20Z illodev@local#2cddaf94 · review → done

## Notes

- 2026-08-05 15:35Z illodev@local#2cddaf94 — The two JSON artifacts are compared by value now, against exactly what an install would write.

The ledger was the answer the card pointed at, and it needed one change to be usable: it recorded top-level keys (`mcpServers`, `hooks`) while the merge is one level deeper (`next[key] = { ...current[key], ...ours }`). Ownership is per second-level key — `mcpServers.workfile` is ours, a `mcpServers.postgres` the repository added in the same object is not — so the ledger now records the leaves:

```json
{ "keys": {
    "mcp": ["mcpServers.workfile"],
    "hooks": ["hooks.SessionStart", "hooks.PreToolUse", "hooks.PostToolUse"]
} }
```

That one representation serves both halves. `driftedPaths` compares those paths and names the ones that moved, so the report says `stale .mcp.json (mcpServers.workfile)` rather than `stale` — the [[T-0169]] lesson, applied where it was still missing. And removal deletes the leaf rather than the parent, dropping an object only if emptying it left nothing: previously, ceasing to generate `hooks` would have taken a `hooks.Stop` the repository owned with it. A ledger written before this holds the parent; that shape is still read, and is silently upgraded on the next sync.

Values, not bytes. The file belongs to the repository, so its formatting and key order are not ours to have an opinion about.

Verified end to end on a workspace built with `init` + `claude install`:

- `mcpServers.postgres` and a `permissions` block added by hand → still `current`, and `install` leaves both alone (criterion #2).
- `mcpServers.workfile.args` hand-edited to `@illodev/workfile@0.5.2` → `stale (mcpServers.workfile)`, and `install` repairs it while `postgres`, `permissions` and a repository-owned `hooks.Stop` survive (criterion #1).
- the workspace then gains `node_modules/@illodev/workfile` and nothing else changes → both files reported stale in the same breath, because since [[T-0178]] the hooks follow the same `hasLocalInstall` answer as the server (criterion #3):

```
stale  .mcp.json  (mcpServers.workfile)
stale  .claude/settings.json  (hooks.SessionStart, hooks.PreToolUse, hooks.PostToolUse)
```

Vacuity checked against the built `dist`: making `driftedPaths` return nothing fails the test, and making it compare whole top-level keys fails it on the neighbouring server — which is the assertion that would otherwise have been free.
- 2026-08-05 17:20Z illodev@local#2cddaf94 — Runtime evidence: merged to main in PR #22 (fea0cff..bda003c) and verified by the full CI matrix on the merge commit — ubuntu, macos and windows on node 22 and 24, plus smoke, doctor and codeql, all green. 328 tests + 7 search-local, strict ratchet held at 494.
