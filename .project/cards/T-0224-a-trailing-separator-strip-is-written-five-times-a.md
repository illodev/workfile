---
id: T-0224
title: A trailing-separator strip is written five times, as a regex
status: backlog
type: chore
priority: low
area: core
tags: [security]
effort: S
created: 2026-08-07
updated: 2026-08-07
---

CodeQL reported `js/polynomial-redos` against `routeRoots` in `docs/validation.ts`: `replace(/\/+$/, "")` retries the anchored `+` from every start position, so a value of N slashes costs O(N²). The alert was high and it blocked a pull request that had nothing to do with it.

The spelling appeared five times across the package and once more in the hook, and only one of them was reachable from a declared value — which is why only one was reported. Replaced by `stripTrailingSlashes` in `core/glob.ts`, a linear loop, plus the hook's own copy since it imports nothing.

Filed to record what is not done: nothing stops the sixth copy. The suite has no rule against an anchored quantifier over a value that comes out of config or a card, and CodeQL only reports the ones whose taint it can follow.

## Acceptance criteria

- [ ] A test or lint rule fails on an anchored `+`/`*` applied to a config or record value.
- [ ] It names the linear alternative rather than only refusing.
- [ ] The existing six sites pass it.
