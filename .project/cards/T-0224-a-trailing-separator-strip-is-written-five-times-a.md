---
id: T-0224
title: A trailing-separator strip is written five times, as a regex
status: done
type: chore
priority: low
area: core
tags: [security]
effort: S
created: 2026-08-07
updated: 2026-08-07
scope: [packages/workfile/test]
verified:
  at: "2026-08-07T23:51:17.943Z"
  method: local
  commit: eb12a11b8e26cedc67bcaf0b279e80542b40b4d7
  digest: "sha256:d21ebdd6298ef0abe47e0f7d4cc14beb7b991b70e7ff2be4f781a5dec60f916f"
---

CodeQL reported `js/polynomial-redos` against `routeRoots` in `docs/validation.ts`: `replace(/\/+$/, "")` retries the anchored `+` from every start position, so a value of N slashes costs O(N²). The alert was high and it blocked a pull request that had nothing to do with it.

The spelling appeared five times across the package and once more in the hook, and only one of them was reachable from a declared value — which is why only one was reported. Replaced by `stripTrailingSlashes` in `core/glob.ts`, a linear loop, plus the hook's own copy since it imports nothing.

Filed to record what is not done: nothing stops the sixth copy. The suite has no rule against an anchored quantifier over a value that comes out of config or a card, and CodeQL only reports the ones whose taint it can follow.

## Acceptance criteria

- [x] A test or lint rule fails on an anchored `+`/`*` applied to a config or record value.
- [x] It names the linear alternative rather than only refusing.
- [x] The existing six sites pass it.

## Activity

- 2026-08-07 23:37Z illodev@local#42eb42f5 · claimed
- 2026-08-07 23:51Z illodev@local#42eb42f5 · released

## Notes

- 2026-08-07 23:51Z illodev@local#42eb42f5 — The card said nothing stops the sixth copy. Writing the rule found that there were already six more, and one of them mattered: `replace(/\n+$/, "")` in `core/frontmatter.ts`, applied to a record *body*, which nothing caps — unlike a title, refused past 80 characters on write. A body of half a million newlines followed by one other character is O(N²) with no bound but the disk. Fixed with a linear strip. CodeQL never reported it; it reported the one copy whose taint it could follow from a declared value.

The five slug helpers keep the shape and are allowlisted with the bound that makes them safe rather than because they look fine: they run on a title, and the 80-character cap is the argument. Take the cap away and they are the next finding, which the allowlist says out loud.

The rule caught two of its own faults on the way. It reported the comment that explains the shape — a rule that reports prose teaches people to stop reading it — and its `g`-flagged matcher carried `lastIndex` between files, so the staleness half silently skipped whichever file followed a match. Both mutation-proven now, along with a seventh copy and a stale allowlist entry.
- 2026-08-07 23:51Z illodev@local#42eb42f5 — local verification: A rule over `src` and `bin` refusing a `replace` whose pattern ends in an anchored `+$`/`*$`, naming `stripTrailingSlashes` as the alternative, with an allowlist that carries the bound making each entry safe and fails when an entry stops applying. It found a seventh site the card did not know about — `\n+$` over an uncapped record body — which is fixed. Mutation-proven four ways: a new copy in an unbounded file, a stale allowlist entry, and the two faults the rule had itself (reporting its own documentation, and a `g` matcher carrying lastIndex between files).
