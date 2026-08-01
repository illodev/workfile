---
id: T-0083
title: The cost gate counts bytes but never operations
status: done
type: task
priority: medium
area: infra
created: 2026-08-01
updated: 2026-08-01
scope: [packages/workfile/test/budgets.test.ts]
---

`budgets.test.ts` gates payload **bytes** on the S workspace, and its reasoning is right: "times drift with the machine; bytes do not". But no byte budget can see a complexity regression. The four mutators reading the corpus twice (T-0081) cost 2x at every scale and moved not one byte.

The bench harness knows about scales up to 13,100 records and CI never runs it.

## What was measured

A timing ratio — mutation cost against a bare `loadCards` — was tried and **rejected**. Across two runs at M scale the pre-fix figure came out 2.30x and then 1.54x, against 0.93x and 0.78x after. The gap is real but the variance is not survivable on a loaded two-core runner, and shipping a flaky gate is worse than shipping none.

Counting filesystem operations through `async_hooks` is exact instead:

| | before T-0081 | after |
| --- | --- | --- |
| `loadCards` | 156 ops | 156 ops |
| `claimCard` | 327 (2.10x) | 171 (1.10x) |
| `transitionCard` | 327 (2.10x) | 171 (1.10x) |

Identical across repeated runs, and a count does not care how fast the machine is. Same doctrine as the byte budgets, one level down.

## Activity

- 2026-08-01 17:25Z illodev@local#e55eab30 · claimed
- 2026-08-01 17:25Z illodev@local#e55eab30 · claimed
- 2026-08-01 17:27Z illodev@local#e55eab30 · doing → review
- 2026-08-01 17:29Z illodev@local#e55eab30 · review → done

## Notes

- 2026-08-01 17:27Z illodev@local#e55eab30 — Shipped as a second test in budgets.test.ts, counting filesystem operations through async_hooks rather than timing anything. Verified in both directions: reintroducing the double read fails the gate with `claim cost 327 filesystem operations against 156 for a bare corpus read (2.10x)`, and the message names the fix. Full check green at 189 + 7 tests, ratchet 601, none new.
