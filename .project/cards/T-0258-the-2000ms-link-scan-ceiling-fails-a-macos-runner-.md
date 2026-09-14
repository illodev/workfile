---
id: T-0258
title: The 2000ms link-scan ceiling fails a macOS runner and passes on re-run
status: review
type: bug
priority: medium
area: core
source: packages/workfile/test/record-body-safety.test.ts
related: [T-0162, T-0166, T-0179]
raised: derived
produced_by:
  model: undeclared
  reasoning: xhigh
  basis: self-reported
created: 2026-09-14
updated: 2026-09-14
scope: [packages/workfile/test/record-body-safety.test.ts, packages/workfile/src/core/markdown.ts]
---

`check (macos-latest, 24)` failed CI run 34884318793 on main (commit 1a49f85, 2026-09-14) with `a document body of unclosed links does not stall the doctor` — `AssertionError: unclosed labels took 2293ms` against `LINK_CEILING_MS = 2000`. The other eight jobs were green, and re-running the failed job on the same commit passed. The two attempts, same runner configuration, same 192,000-character bodies:

```
                      targets    labels
attempt 1 (failed)     1555ms    2293ms
attempt 2 (passed)     1878ms     788ms
```

The test header sets the ceiling from one machine: labels 726ms in suite, headroom 2.8×. On this runner the same scan varies 2.9× between two runs of one commit, and targets came within 6% of the ceiling on the run that passed — so the headroom the header claims is not the headroom a macOS runner has, for either shape. `check (macos-latest, 22)` also failed on 8c300fa (2026-09-11); that run's logs are no longer available, so whether it was this test is not known.

This is the wall-clock shape [[T-0166]] and [[T-0179]] closed for other tests, arriving in a third: [[T-0179]] answered it with samples across runner configurations rather than a local number, which is the measurement this ceiling has not had.

## Acceptance criteria

- [x] The link-scan test asserts how the scan scales — the fastest of several runs over N and 2N characters, under a ratio a linear scan meets and a quadratic one cannot — instead of a wall-clock ceiling
- [x] The same test proves on the machine running it that the ratio sees a quadratic scan, with an unbounded scan as its control
- [ ] Every CI runner configuration passes it on the first run after the push

The criteria were written as «The link-scan ceiling is set from samples of both shapes across the CI runner configurations, and the samples are written in the test header» and «The chosen ceiling still fails the unfixed quadratic scan on every runner configuration sampled». Measured before choosing, on 2026-09-14: the scan is already bounded — `MAX_LINK_TARGET` 1024 per destination, 512 per label in `core/markdown.ts` — so it is linear with a large constant, about 65 million steps for the test's 192,000-character body, which is why one runner type took 392 to 2293ms on it. A ceiling derived from runner samples would still be a wall-clock number over that constant, with the unfixed case close behind it. Decided by the owner on 2026-09-14: assert the scaling ratio instead, which does not depend on how fast the runner is.

## Activity

- 2026-09-14 19:24Z illodev@local#a112f2f3 · renamed file to T-0258-the-2000ms-link-scan-ceiling-fails-a-macos-runner-.md
- 2026-09-14 20:03Z illodev@local#a112f2f3 via:undeclared/xhigh · claimed
- 2026-09-14 20:15Z illodev@local#a112f2f3 via:undeclared/xhigh · doing → review

## Notes

- 2026-09-14 19:34Z illodev@local#a112f2f3 via:undeclared/xhigh — A third sample, from the green CI run 34886918447 on 187b5e0 (2026-09-14), every configuration, same 192,000-character bodies — labels / targets: macOS 22 343/375ms, macOS 24 392/1052ms, ubuntu 22 641/442ms, ubuntu 24 1268/404ms, windows 22 967/609ms, windows 24 946/473ms. With the two macOS 24 attempts above, labels on that one configuration have measured 2293, 788 and 392ms, and targets 1555, 1878 and 1052ms: a 5.8x spread for labels on one runner type, and the worst targets sample at 94% of the 2000ms ceiling.
- 2026-09-14 20:11Z illodev@local#a112f2f3 via:undeclared/xhigh — Measured locally on 2026-09-14 before writing the test, fastest of 5 runs for the bounded scan through diagnoseDocuments and of 3 for the unbounded spelling /\[[^\]]*\]\(([^)]+)\)/g: bounded targets 24.8ms at 16k chars, 47.9ms at 32k, 99.5ms at 64k (ratios 1.94 and 2.08); bounded labels 27.0, 54.2 and 109.1ms (2.00, 2.01); unbounded targets 15.9ms at 8k, 63.3ms at 16k, 258.1ms at 32k (3.98, 4.08); unbounded labels 40.5, 159.6 and 647.4ms (3.94, 4.06). A ratio ceiling of 3 sits a full step from both; the test uses 32k to 64k for the scan and 8k to 16k for the control, which keeps the control under a second here.
- 2026-09-14 20:14Z illodev@local#a112f2f3 via:undeclared/xhigh — Rewritten on 2026-09-14 as decided. record-body-safety.test.ts times the doctor's path (diagnoseDocuments over one document) at 32,000 and 64,000 characters, fastest of 5 runs after a warm-up, and requires the ratio under 3; before that, for each shape, it runs the unbounded spelling the fix replaced at 8,000 and 16,000 characters, fastest of 3, and requires over 3 — so a machine whose timings cannot see a quadratic fails on the control instead of passing the scan unexamined. The folder test keeps its 500ms ceiling, 83x above what it measures. Passing locally, alone: unbounded targets 15.6 → 61.9ms (3.97x), link scan targets 46.5 → 111.7ms (2.40x), unbounded labels 39.7 → 159.7ms (4.03x), link scan labels 54.6 → 113.7ms (2.08x). Criterion 3 is the CI run on every runner configuration after the push, so the exit is review.
- 2026-09-14 20:15Z illodev@local#a112f2f3 via:undeclared/xhigh — In the full suite on this build (538/538, exit 0), with every test file running at once: unbounded unclosed targets: 27.0ms → 125.9ms, 4.67×;unbounded unclosed labels: 85.4ms → 337.0ms, 3.95×. Exit: review — criteria 1 and 2 are met; criterion 3 is the CI run on every runner configuration after the push.
