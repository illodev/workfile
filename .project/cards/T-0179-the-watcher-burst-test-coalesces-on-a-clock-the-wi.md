---
id: T-0179
title: The watcher burst test coalesces on a clock the Windows node 24 runner misses
status: done
type: bug
priority: medium
area: infra
created: 2026-08-05
updated: 2026-08-05
scope: [packages/workfile/test/events.test.ts]
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
into one batch. It does not measure delivery latency; it measures whether the
writes *themselves* finish inside the quiet period. On a runner with five
seconds of slack to distribute, they do not, the watcher correctly reports
three batches, and the test calls a correct result wrong.

**T-0006 already tried the obvious answer.** The quiet period in this test was
250 ms and was widened to 1000 ms on 2026-07-30 (`89b19d0`, "A batch split now
requires a full second of silence"), on the reading that Windows delivers a
burst's events with gaps past 850 ms. It is 1000 ms today and it failed anyway,
six days later, because the gaps reach 4842 ms. Widening is not a fix that got
the number wrong; it is a fix that cannot work, because the number under
pressure is the quiet period itself and moving it changes the behaviour under
test rather than the tolerance around it.

The burst has to be established as a burst by construction, not by hoping the
writes land close together.

## Acceptance criteria

- [x] The burst is a burst regardless of how slowly the writes are issued
- [x] The quiet period stays the value the product ships, not one tuned to pass
- [x] A failure says whether the coalescer misgrouped or the writes were spread

## Activity

- 2026-08-05 14:32Z illodev@local#2cddaf94 · claimed
- 2026-08-05 14:46Z illodev@local#2cddaf94 · doing → review
- 2026-08-05 17:20Z illodev@local#2cddaf94 · review → done

## Notes

- 2026-08-05 14:45Z illodev@local#2cddaf94 — The test split in two, along the line between what the coalescer owes and what the platform does.

**Grouping is now proven with events the test places itself.** `stubWatch` moved to `test/support/watch-stub.ts` — it already existed in `watcher-recovery.test.ts` for delivering a dead handle on purpose — and gained `deliver(directory, name)`. The loop that calls it never yields, so no timer can fire between two events however loaded the machine is: the burst is a burst by construction. The quiet period is now whatever the product ships, because the test overrides none of the watcher's timing options, and `startProjectServer` overrides none of them either. Criteria #1 and #2.

**Delivery is proven against the real filesystem, and asserts nothing about batch counts.** Every write is reported, no noise ever is. The negative assertions no longer wait a fixed interval and hope: the atomic-write temporary and the cache file are written *before* a real card in the same directory, so once that card is reported, whatever the platform had to say about the other two has already been said. That was the other clock in this test — waiting 1400 ms for an event that must not arrive passes just as well when the event is merely still in flight.

Criterion #3 is served by which test fails rather than by a message that guesses: a grouping fault fails the scripted test and only that one, a lost write fails the filesystem test and carries the widest gap between two writes in its message. Verified by breaking the product three ways against the built `dist`:

- `flush()` called per event instead of on a timer → only `a burst is one batch…` fails, on `two events inside one quiet period are one batch`.
- `isNoise` returning false → both fail, on `atomic-write temporaries are noise` and `…are not events`.
- `isNoise` dropping the burst writes → only the filesystem test fails: `the watcher never reported 40 of 40 writes; the widest gap between two of them was 1ms`. One millisecond is the discrimination working — the writes were not spread, so the fault is not the clock.

Also checked that the cache assertion has teeth: with both `storage.cache` and `docs.exclude` cleared, `.project/.cache` is watched. Two independent excludes reach it, so removing either alone changes nothing — which is why the test asserts the outcome rather than the list.

**The pair runs in 1.56 s against the old test's 8.1 s**, and the ~8.1 s floor every configuration shared was this test's own sleeps. 317 tests pass; the strict baseline improves 504 → 498.

Runtime evidence on Windows node 24 is still pending, which is the whole point of the card, so this stays in `review` until CI reports.
- 2026-08-05 17:20Z illodev@local#2cddaf94 — Runtime evidence: merged to main in PR #22 (fea0cff..bda003c) and verified by the full CI matrix on the merge commit — ubuntu, macos and windows on node 22 and 24, plus smoke, doctor and codeql, all green. 328 tests + 7 search-local, strict ratchet held at 494.
