---
id: T-0178
title: The hooks have no portable form, so an npx-only workspace gets dead hooks
status: backlog
type: bug
priority: medium
area: mcp
created: 2026-08-05
updated: 2026-08-05
---

[[T-0170]] made `.mcp.json` prefer the workspace's own copy of the package and
fall back to `npx -y` when there is none. The hooks have no such fallback:

```
node node_modules/@illodev/workfile/dist/src/runtime/claude/hooks.mjs …
```

That is the only form `claudeHooksFile` emits. In a workspace with no local
install — the one that only ever used the global binary, which is exactly the
workspace `npx` exists for — all three hooks name a file that is not there.

So the two halves of the surface agree when the package is installed, which is
what T-0170 set out to fix, and cannot agree when it is not. The MCP server
starts; the hooks do not. And the failure is quiet: nothing in `claude check`
runs the command, and the report in [[DOC-0005]] already notes that a hook
which exits 0 in silence is indistinguishable from one that works.

Not obvious, and the reason this is a card rather than a patch: a hook is
spawned before tool calls, and the `PreToolUse` matcher exists at all because
the latency budget is built on not spawning node for a `Bash`. `npx` resolving
a package on every hook invocation is a different cost from resolving it once
when a server starts. Options worth weighing: emit the hooks only when a local
install exists and say so, resolve the runtime path at install time, or ship a
launcher that falls back once and caches.

## Acceptance criteria

- [ ] A workspace with no local install either gets hooks that run, or is told it has none
- [ ] The `PreToolUse` latency budget is measured against whatever is chosen, not assumed
- [ ] `claude check` distinguishes a hook that cannot run from one that is current
