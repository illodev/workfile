---
id: T-0160
title: --root accepts any directory and answers from an empty workspace
status: backlog
type: bug
priority: low
area: core
effort: S
scope: [packages/workfile/bin/workfile.ts, packages/workfile/src/core]
origin: [T-0159]
created: 2026-08-04
updated: 2026-08-04
---

`workfile doctor --root packages/workfile` runs. It reports six
`agent-instructions-missing` issues, exits 0, and says nothing about the fact
that `packages/workfile` is not a workspace and has no `.project/` at all.
`card list --root packages/workfile` likewise returns an empty list rather than
an error.

The guard exists, but only on the other path. `loadWorkspace({ cwd })` walks up
looking for a marker and throws `WORKSPACE_NOT_FOUND` with exit code 2 when
there is none — `workspace.test.ts` covers it. `loadWorkspace({ root })` takes
the directory as given and checks nothing, which is what `--root` routes to.

## Why it is worth fixing

The failure is silent and plausible. A mistyped or stale `--root` inside a
monorepo — one directory too deep is the obvious case — produces a clean,
empty, believable answer: no cards, no errors. Nothing distinguishes it from a
workspace whose board is genuinely empty.

It also indexed the wrong tree rather than none: pointed at
`packages/workfile`, it found the eight files under `docs/` and reported them
as the workspace's documents.

## Design notes

`--allow-new` already exists for the legitimate case of naming a directory that
is not a workspace yet, and `init` uses it. So the fix is to make `root` respect
the same marker check `cwd` does, and let `--allow-new` be the way through —
which is what the flag is documented to mean: "Accept a directory that is not
yet a workspace".

Worth checking whether `--root` should also discover upward, or stay strict.
Strict seems right: `--root` is an assertion by the caller, and silently
resolving to a parent would be a second surprise rather than a fix.

## Acceptance criteria

- [ ] `--root` pointed at a directory with no workspace marker is an error
- [ ] The error names the directory and points at `init` or `--allow-new`
- [ ] `--allow-new` still accepts a not-yet-workspace directory
- [ ] Nothing writes a cache into a directory that failed the check
- [ ] `pnpm run check` green, doctor 0/0
