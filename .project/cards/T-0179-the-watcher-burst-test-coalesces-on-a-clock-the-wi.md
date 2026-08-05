---
id: T-0179
title: The watcher burst test coalesces on a clock the Windows node 24 runner misses
status: backlog
type: bug
priority: medium
area: infra
created: 2026-08-05
updated: 2026-08-05
---

`events.test.ts` — `the watcher covers the corpus, coalesces bursts and ignores
the cache` — failed `check (windows-latest, 24)` on PR #21, whose diff was two
Markdown records:

```
✖ the watcher covers the corpus, coalesces bursts and ignores the cache (10349ms)
  AssertionError: a burst coalesces into one batch
  3 !== 1
```

This is [[T-0006]], closed as `done`, returning. [[T-0166]] recorded the
occurrence; it did not own it, and the measurement T-0166 ran to set its own
budget answers the question this one was left holding.

239 samples of each test across 40 commits and six runner configurations. Test
duration in ms:

```
  macos    node 22   p50 8192   p90  8253   max  8529
  macos    node 24   p50 8203   p90  8279   max  8391
  ubuntu   node 22   p50 8130   p90  8164   max  8171
  ubuntu   node 24   p50 8119   p90  8138   max  8170
  windows  node 22   p50 8413   p90  8721   max  9516
  windows  node 24   p50 8485   p90 10350   max 13329
```

Every configuration sits on the same ~8.1s floor, which is the test's own
sleeps. What differs is the tail, and only on Windows: node 22 reaches 9516,
node 24 reaches 13329 — 5.2 seconds of slack over the floor, against 40 ms on
ubuntu. Paired by commit, node 24 was slower than node 22 on 59% of the runs
both ran, by a worst case of 4842 ms.

That is the whole failure. The assertion is that a burst of writes coalesces
into one batch under a 250 ms quiet period. It does not measure delivery
latency; it measures whether the writes *themselves* finish inside the quiet
window. On a runner with five seconds of slack to distribute, they do not, the
watcher correctly reports three batches, and the test calls a correct result
wrong.

So the fault is in the test's clock, not in the coalescer. What it cannot do is
what [[T-0166]] did — widen a budget — because the number under pressure is the
quiet period itself, and widening that changes the behaviour under test rather
than the tolerance around it. The burst has to be established as a burst by
construction, not by hoping the writes land close together.

## Acceptance criteria

- [ ] The burst is a burst regardless of how slowly the writes are issued
- [ ] The 250 ms quiet period stays the value under test, not a value tuned to pass
- [ ] A failure says whether the coalescer misgrouped or the writes were spread
