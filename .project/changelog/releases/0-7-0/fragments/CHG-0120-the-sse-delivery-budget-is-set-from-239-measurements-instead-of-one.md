---
id: CHG-0120
title: The SSE delivery budget is set from 239 measurements instead of one
type: changed
area: infra
visibility: internal
created: 2026-08-05
updated: 2026-08-05
---
`the SSE channel reports writes made outside the server` asserted delivery
under 2000 ms on every platform. It failed once at 2243 ms on
`check (windows-latest, 24)`, on a commit whose diff was scripts, media and
Markdown, and the card that recorded it refused to call one observation a
verdict.

239 samples of the test, harvested from the logs of 40 CI runs across six
runner configurations. Delivery latency in ms:

```
  macos    node 22   p50  284   p90  350   max  544
  macos    node 24   p50  285   p90  334   max  544
  ubuntu   node 22   p50  371   p90  413   max  481
  ubuntu   node 24   p50  383   p90  422   max  451
  windows  node 22   p50  435   p90  714   max 1208
  windows  node 24   p50  595   p90 1105   max 1632
```

2000 ms is four times the worst ever seen on macOS and Linux, and 1.2 times the
worst on Windows. The 2243 ms observation ranks above all 79 Windows samples:
contention on one occasion, not a regression in delivery — which is what the
card left open and could not settle from one run.

**Windows now carries a 4000 ms budget and everything else keeps 2000.** The
number is in the test with the table it came from, so the next person moves it
by measuring rather than by guessing.

**The test reports its own latency**, through `t.diagnostic`, on every run and
whether it passes or fails. That is the part worth keeping: this measurement
cost an hour of log parsing because Node 22 defaults to the TAP reporter off a
TTY and Node 23+ defaults to spec, so the same suite states durations in two
shapes across the matrix. One diagnostic line is greppable from any job.

The wait window is twice the budget rather than a fixed 3000 ms, so an event
that is merely late is still observed as late. A loop that gave up at the
budget would report every late delivery as a lost one, and a lost event is a
dropped watch while a late one is a loaded runner — T-0109 made that
distinction and it survives here.
