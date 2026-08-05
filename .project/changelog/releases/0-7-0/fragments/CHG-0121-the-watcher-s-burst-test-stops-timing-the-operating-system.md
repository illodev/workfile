---
id: CHG-0121
title: The watcher's burst test stops timing the operating system
type: fixed
area: infra
visibility: internal
created: 2026-08-05
updated: 2026-08-05
cards: [T-0179]
---
`the watcher covers the corpus, coalesces bursts and ignores the cache` wrote
forty files and asserted the watcher reported them as one batch. That is a
claim about the coalescer being settled by the operating system's delivery
schedule: whether forty writes reach a watcher inside one quiet period is a
fact about the runner, and no platform promises it.

It failed on `check (windows-latest, 24)` twice in six days on diffs that
touched no code. [[T-0006]] answered the first by widening the quiet period from
250 ms to a full second. [[T-0179]] measured why that could not work — 239
samples across 40 commits and six runner configurations put the gaps inside one
burst at 4842 ms on a loaded Windows runner, and the number being widened is the
behaviour under test rather than the tolerance around it.

The test is now two tests, split along the line between what the coalescer owes
and what the platform does:

- **Grouping** is proven with events the test places itself, through the
  `fs.watch` stand-in that already existed for delivering a dead handle. The
  delivery loop never yields, so no timer can fire between two events however
  loaded the machine is — the burst is a burst by construction. The quiet period
  goes back to the value the product ships, because the test overrides none of
  the watcher's timing options.
- **Delivery** is proven against the real filesystem and asserts nothing about
  batch counts. Every write is reported, no noise ever is.

The negative assertions stopped waiting on a clock too. The atomic-write
temporary and the cache file are written before a real card in the same
directory, so once that card is reported, whatever the platform had to say about
the other two has already been said. Waiting 1400 ms for an event that must not
arrive passes just as well when the event is merely still in flight.

Which test fails is now the diagnosis: a grouping fault fails the first and only
the first, a lost write fails the second and carries the widest gap between two
writes in its message. Verified by breaking the product three ways rather than
by argument.

The pair runs in 1.56 s against the old test's 8.1 s, which was the floor every
runner configuration shared and was this test's own sleeps.
