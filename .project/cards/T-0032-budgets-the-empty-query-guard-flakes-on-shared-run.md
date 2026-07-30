---
id: T-0032
title: "Budgets: the empty-query guard flakes on shared runners, assert behavior"
status: backlog
type: bug
priority: medium
area: core
created: 2026-07-30
updated: 2026-07-30
---
## Evidence

`check (macos-latest, 22)` on 788da4c: "empty query took 38.3ms against 5.9ms for a real one" — `test/budgets.test.mjs` ("an empty query does not tokenize record bodies") asserts `empty < terms * 2` over two ~6ms wall-clock samples of 5 runs each. On a shared runner one GC pause or scheduler hiccup inside the empty pass breaks the ratio; the identical suite passed on the same code in the five sibling matrix jobs and on the two previous pushes. First observed flake since the test landed.

## Fix direction

The invariant is behavioral, not temporal: an empty query must not tokenize record bodies. Assert THAT — count tokenizations (inject a counter or expose an instrumentation hook on the tokenizer the way the search provider tests inject a fake embedder) and require zero body tokenizations for the empty query. Keep a timing ratio only if it demotes to a logged observation. Wall-clock ratios of single-digit-millisecond samples do not belong in CI assertions.
