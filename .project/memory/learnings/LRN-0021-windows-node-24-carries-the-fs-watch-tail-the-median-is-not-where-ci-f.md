---
id: LRN-0021
title: Windows node 24 carries the fs.watch tail; the median is not where CI flakes live
status: active
created: 2026-08-05
updated: 2026-08-05
tags: [ci, windows, flaky]
---
Two `events.test.ts` failures in one day, on `check (windows-latest, 24)` and
nowhere else, on commits that touched no code. Both from cards closed with
runtime evidence. The reflex reading is "flaky CI"; the measurement says
something narrower.

239 samples of each clock-bound test, harvested from the logs of 40 CI runs
across six runner configurations ([[T-0166]]). SSE delivery latency, in ms:

```
  macos    node 22   p50  284   p90  350   max  544
  macos    node 24   p50  285   p90  334   max  544
  ubuntu   node 22   p50  371   p90  413   max  481
  ubuntu   node 24   p50  383   p90  422   max  451
  windows  node 22   p50  435   p90  714   max 1208
  windows  node 24   p50  595   p90 1105   max 1632
```

**The medians barely separate. The tails do.** ubuntu spans 168 ms between its
best and worst sample over 80 runs; Windows node 24 spans 1280 ms. Paired by
commit, node 24 was slower than node 22 on 62% of the runs both executed — by a
median of 90 ms, and a worst case of 1219 ms. On the burst test the worst pair
differs by 4842 ms.

So a budget set from the median, or from a laptop, or from one green run, is a
budget that fires on the tail of the slowest configuration and nowhere else.
That is not a bug detector; it is a coin flip that trains everyone to re-run
until green — which is what [[T-0109]] wrote down and what happened anyway.

**Set clock-bound thresholds from the tail of the slowest configuration, and
harvest before setting them.** The harvest cost an hour once. It cost that much
because Node 22 defaults to the TAP reporter off a TTY and Node 23+ defaults to
spec, so the same suite reports durations in two shapes across the matrix.
`t.diagnostic` in the test itself sidesteps both: one line, one format,
greppable from any job.
