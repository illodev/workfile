---
id: T-0032
title: "Budgets: the empty-query guard flakes on shared runners, assert behavior"
status: done
type: bug
priority: medium
area: core
created: 2026-07-30
updated: 2026-07-30
scope: [packages/workfile/test/budgets.test.mjs]
---
## Evidence

`check (macos-latest, 22)` on 788da4c: "empty query took 38.3ms against 5.9ms for a real one" — `test/budgets.test.mjs` ("an empty query does not tokenize record bodies") asserts `empty < terms * 2` over two ~6ms wall-clock samples of 5 runs each. On a shared runner one GC pause or scheduler hiccup inside the empty pass breaks the ratio; the identical suite passed on the same code in the five sibling matrix jobs and on the two previous pushes. First observed flake since the test landed.

## Fix direction

The invariant is behavioral, not temporal: an empty query must not tokenize record bodies. Assert THAT — count tokenizations (inject a counter or expose an instrumentation hook on the tokenizer the way the search provider tests inject a fake embedder) and require zero body tokenizations for the empty query. Keep a timing ratio only if it demotes to a logged observation. Wall-clock ratios of single-digit-millisecond samples do not belong in CI assertions.

## Activity

- 2026-07-30 23:16Z claude-fable-e341b469 · claimed
- 2026-07-30 23:16Z claude-fable-e341b469 · claimed
- 2026-07-30 23:20Z claude-fable-e341b469 · doing → done

## Notes

- 2026-07-30 23:20Z claude-fable-e341b469 — Fixed by counting instead of timing: fresh record copies (spread drops the non-enumerable token cache) wrapped in a body-read-counting Proxy. Empty query reads exactly limit bodies (page assembly at records/index.ts:852), asserted <= 40; the control query without postings forces a corpus scan (> N/2 reads). Deterministic — no clocks left. Bonus insight the timing test could never show: the 20 reads it always had were result shaping, not tokenization. 9/9 locally.
