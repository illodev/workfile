---
id: T-0160
title: --root accepts any directory and answers from an empty workspace
status: done
type: bug
priority: low
area: core
effort: S
scope: [packages/workfile/bin/workfile.ts, packages/workfile/src/workspace]
origin: [T-0159]
created: 2026-08-04
updated: 2026-08-07
verified:
  at: "2026-08-07T22:58:21.710Z"
  method: local
  commit: 9cfb0175194fc944ab34f527c800adf4c1b486d2
  digest: "sha256:e3afefb220be80685c23d420ec7ffb7e24b0f57d9ada1868fbf6dd3707a8c919"
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

- [x] `--root` pointed at a directory with no workspace marker is an error
- [x] The error names the directory and points at `init` or `--allow-new`
- [x] `--allow-new` still accepts a not-yet-workspace directory
- [x] Nothing writes a cache into a directory that failed the check
- [x] `pnpm run check` green, doctor 0/0

## Activity

- 2026-08-07 22:17Z illodev@local#42eb42f5 · claimed
- 2026-08-07 22:58Z illodev@local#42eb42f5 · released

## Notes

- 2026-08-07 22:58Z illodev@local#42eb42f5 — local verification: The card's own reproduction now exits 2: `doctor --root packages/workfile` names the directory and both ways forward instead of reporting six issues and exiting 0. `card list` the same. `--allow-new` still accepts one, and it reaches that branch now — it never did, which is how an explicit root came to check nothing. A real workspace is unaffected, and nothing was written into the directory that failed. Strict rather than a walk, so a root inside a workspace is refused rather than silently resolved upward; both halves mutation-proven.
