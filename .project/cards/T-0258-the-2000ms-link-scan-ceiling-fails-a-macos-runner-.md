---
id: T-0258
title: The 2000ms link-scan ceiling fails a macOS runner and passes on re-run
status: backlog
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

- [ ] The link-scan ceiling is set from samples of both shapes across the CI runner configurations, and the samples are written in the test header
- [ ] The chosen ceiling still fails the unfixed quadratic scan on every runner configuration sampled

## Activity

- 2026-09-14 19:24Z illodev@local#a112f2f3 · renamed file to T-0258-the-2000ms-link-scan-ceiling-fails-a-macos-runner-.md
