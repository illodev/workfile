---
id: LRN-0017
title: A local green that skips pnpm audit is not the gate CI runs
status: active
created: 2026-08-03
updated: 2026-08-03
related: [T-0148, T-0146]
tags: [release, ci, verification]
---
`check:release` is `check && pnpm audit --audit-level=high && smoke:package`,
and `check` is `build && build:plugin && strict && test`. Running `build:core`,
`strict` and `test` locally covers four of the seven and reads as green.

That is how `v0.5.4` shipped a tag whose release did nothing. Every code check
passed in CI exactly as it had locally; the gate stopped on a `fast-uri`
advisory reaching the workspace through `@commitlint/cli`, which no local run
had ever consulted. See [[T-0148]].

## The part that generalises

The three steps skipped were the three that depend on something outside the
source: the npm advisory database, a full `vite` build, and a packed tarball
installed into a temporary directory. Those are precisely the checks a source
edit cannot predict, so they are precisely the ones worth running before a tag
rather than after one.

## What to do instead

Before anything that pushes a tag, run `pnpm run check:release` whole. It takes
about three minutes. A tag is the one push in this repository that cannot be
corrected by another commit — it has to be moved, and moving it is only safe
while no artifact exists under it.
