---
id: T-0106
title: A stale committed build artifact is invisible to CI
status: review
type: bug
priority: medium
area: infra
scope: [.github/workflows/ci.yml]
related: [T-0093, T-0105]
created: 2026-08-02
updated: 2026-08-02
---

`plugins/workfile/runtime/hooks.mjs` is committed and is what a user installs
from the plugin marketplace. The Windows actor fix (T-0105) reached the source
and `dist` but not it, because the commit staged `.project` and `packages`
explicitly — so the distributable hook kept reading `$USER` and `$HOSTNAME`
alone while the source did not.

The drift test from [[T-0093]] exists precisely to catch this and cannot. `pnpm
run check` runs `build:plugin` before the tests, so by the time the test reads
the file it has already been regenerated: it compares fresh output against
fresh output and passes unconditionally in CI. It only fails locally, and only
when you edit the source and run the tests without building — which is what
caught it this time, by luck.

A generated artifact that is committed needs the build to be checked against
the commit, not against itself.

## The fix

One CI step after `check`: rebuild, then `git diff --exit-code`. Verified safe —
a full `pnpm run build` plus `build-plugin` leaves the tree clean, so the guard
fires only on genuine staleness. It covers every committed generated artifact,
not just the plugin.

## Acceptance criteria

- [x] CI fails when a committed generated artifact is behind its source
- [x] A clean checkout with a current artifact still passes

## Activity

- 2026-08-02 01:31Z illodev@local#e55eab30 · claimed
- 2026-08-02 01:31Z illodev@local#e55eab30 · doing → review

