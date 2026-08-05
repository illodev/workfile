---
id: T-0178
title: The hooks have no portable form, so an npx-only workspace gets dead hooks
status: done
type: bug
priority: medium
area: mcp
created: 2026-08-05
updated: 2026-08-05
scope: [packages/workfile/src/modules/claude]
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

- [x] A workspace with no local install either gets hooks that run, or is told it has none
- [x] The `PreToolUse` latency budget is measured against whatever is chosen, not assumed
- [x] `claude check` distinguishes a hook that cannot run from one that is current

## Activity

- 2026-08-05 15:17Z illodev@local#2cddaf94 · claimed
- 2026-08-05 15:36Z illodev@local#2cddaf94 · doing → review
- 2026-08-05 17:27Z illodev@local#2cddaf94 · review → done

## Notes

- 2026-08-05 15:35Z illodev@local#2cddaf94 — Measured before choosing, which is what criterion #2 asked for. Per invocation on this machine, 20 samples each, npx cache already warm:

```
  bare node spawn (floor)                p50   20ms   p90   21ms
  node node_modules/…/hooks.mjs          p50   25ms   p90   28ms
  workfile-hooks (bin, through PATH)     p50   26ms   p90   27ms
  npx -y @illodev/workfile               p50 1663ms   p90 1772ms
  node dist/bin/workfile.js version      p50   99ms   p90  101ms
```

**`npx` is not a slower hook, it is a different product.** 1.6 seconds before every `Edit` and — since `PostToolUse` matches `*` — after every tool call, on a budget the runtime was written around: it imports nothing from the package precisely so it costs process startup rather than the workspace. That closes the third option the card listed, and the first two collapse into one answer.

**So: a dedicated bin.** `workfile-hooks` → `dist/src/runtime/claude/hooks.mjs`, the same script the relative path names, already copied to `dist` and already `chmod 0755` by `prepare-bin`. One millisecond over the relative form, because PATH resolution is all that is added. A workspace with the package installed keeps `node node_modules/…`; one without gets `workfile-hooks`, which is on PATH exactly when the global install that made such a workspace possible is present.

The candidate I rejected: resolving an absolute path at install time. `.claude/settings.json` is committed, so that puts one machine's home directory into everyone else's checkout — worse than a dead hook, because it looks deliberate and varies per person.

`planClaudeSurface` now asks `hasLocalInstall` once and answers for both halves, so the server and the hooks cannot name different copies. That is the T-0170 property, now actually enforced rather than true by coincidence in the installed case.

**Criterion #3** — `checkClaudeSurface` returns `runtime: { command, status, reason }` beside `files`, not among them. A hook runtime is not a file, and "the settings file says what an install would write" is not the same claim as "the hooks run": the first is `current` while the second is `unreachable`, and they have two different repairs. The bin is resolved against PATH (with `PATHEXT` on Windows), the local form against the filesystem.

`ok` deliberately stays about the files. Whether a bin is on this machine's PATH is not a property of the workspace — two people sharing a checkout get different answers — and the pre-commit hook runs `doctor --severity error`. It is a `claude-hook-unreachable` **warning**, which is where a fact like that belongs.

**Criterion #2's other half**: `hooks make the claim executable without slowing the session` already measures that script against a stand-in process, and `the portable hook runtime is the script the budget was measured on` asserts the bin resolves to the same file — so the existing measurement covers the new form, and stops covering it the moment someone points the bin elsewhere. Pointing it at the CLI instead would put 99ms of module graph in front of every tool call; verified that the test catches exactly that.

Vacuity checked against the built `dist`: forcing the local form fails the surface-agreement test, and forcing reachability to succeed fails the reachability test.

Still `review`: this is verified on Linux with a symlinked shim on PATH. The Windows path through `PATHEXT` and npm's generated `.cmd` shims is covered by code and by CI, not yet by a run I have watched.
- 2026-08-05 17:22Z illodev@local#2cddaf94 — Not closed on the CI matrix, unlike the other sixteen. The card shipped saying the Windows path through PATHEXT and npm's generated .cmd shims was covered by code and by CI but not by a run I had watched — and checking that turned out to be right: the reachability test sets PATH to the empty string, which every platform reaches identically, because the directory loop does nothing and PATHEXT is split and then never used. The positive lookup had no test at all. Added 'the hook runtime is found under the extension the platform installs it with': it writes workfile-hooks.cmd on Windows and workfile-hooks elsewhere, puts that directory on PATH, and asserts the runtime resolves — plus, on Windows only, that a bare extensionless file does not count, since that is exactly what npm does not write. Vacuity: forcing the win32 branch on Linux fails it, so the extension candidates are load-bearing rather than decoration. Stays in review until a Windows runner has executed it.
- 2026-08-05 17:27Z illodev@local#2cddaf94 — Closed on a run I watched, which is what the card was held open for. windows-latest node 22 and node 24 both green on commit 37b486c, and the new test appears by name in the Windows log: 'ok 79 - the hook runtime is found under the extension the platform installs it with'. So the PATHEXT lookup has now resolved a real .cmd on a real Windows runner, rather than being covered by reading the code.
