---
id: T-0177
title: The two generated JSON artifacts are checked by existence, not by content
status: backlog
type: bug
priority: medium
area: mcp
created: 2026-08-05
updated: 2026-08-05
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

- [ ] `claude check` reports a generated key whose value drifted from what install would write
- [ ] Keys the repository owns in the same file are not compared and not reported
- [ ] A workspace that gains or loses the local dependency is reported before the next install
