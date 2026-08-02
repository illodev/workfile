---
id: T-0109
title: The SSE external-write test is flaky on the Windows runner
status: done
type: bug
priority: medium
area: infra
scope: [packages/workfile/test/events.test.ts]
created: 2026-08-02
updated: 2026-08-02
---

`events.test.ts:157` — "the SSE channel reports writes made outside the
server" — failed on `check (windows-latest, 22)` at commit `7b70ee4` and passed
on a re-run of that same commit. Same code, same runner image, both outcomes.
Not a regression: it is a race that was already there and is now more likely to
fire.

```
not ok 124 - the SSE channel reports writes made outside the server
  error: one write, one records.changed
  0 !== 1
```

The test writes a card outside the server and polls for up to 3000 ms for the
watcher to deliver it. Zero frames means nothing arrived in three seconds. The
heartbeat is not the culprit — it is an SSE comment and `readStream` skips
lines starting with `:` — so this is `fs.watch` delivery latency under load.

What changed around it: [[T-0102]] added `axes.test.ts`, which starts an HTTP
server and spawns CLI subprocesses. Node's test runner runs files in parallel,
so every file added raises contention on the slowest runner in the matrix. The
flake was latent; the suite got heavier and it surfaced. Every further test file
makes it likelier, which is why this is worth fixing rather than re-running.

Re-running until green is the failure mode to avoid here: it launders a real
signal, and this repository has already shipped three commits on a red CI once
because nobody looked.

## Acceptance criteria

- [x] The cause is established — watcher delivery latency, a dropped event, or
      an event the batch never flushed — rather than assumed
- [x] The test distinguishes "the event never arrived" from "it arrived slowly",
      so a failure says which
- [x] The Windows job passes the SSE test across repeated runs of one commit

## Activity

- 2026-08-02 16:05Z illodev@local#aed59c5e · claimed
- 2026-08-02 16:25Z illodev@local#aed59c5e · doing → review
- 2026-08-02 16:25Z illodev@local#aed59c5e · released
- 2026-08-02 18:58Z illodev@local#aed59c5e · claimed
- 2026-08-02 18:58Z illodev@local#aed59c5e · doing → done

## Notes

- 2026-08-02 16:24Z illodev@local#aed59c5e — Cause established, and it is not the delivery latency this card assumed.

The server starts the watcher lazily and does not await it — `void
ensureWatching()` at `http.ts:768` — then writes `hello` in the same tick. The
test's `sleep(200)` waited for that frame, which had already been flushed, and
synchronised with nothing. Until `start()` finishes (realpath, `probe()` with a
500 ms ceiling, `collectDirectories`, then a handle per directory) there is no
watch on `.project/cards`, and `fs.watch` does not report writes that predate
the handle. The event was not late. It was lost, permanently, with no rescan.

Measured, on Linux:

- Deterministic causality. Writing before the watcher is ready gives
  `{"readyBeforeWrite":false,"changes":0}` three times out of three — exactly
  the reported `0 !== 1`. Writing at +800 ms gives `{"changes":1}` three out of
  three.
- `mode` is not a readiness signal. At +20 ms `/api/v2/metrics` already says
  `{"mode":"watch","directories":0}`: it is initialised to `"watch"` and only
  ever degrades. `directories > 0` is the one that becomes true on start.
  Recorded as [[LRN-0009]].
- Readiness is ~32 ms idle and stayed inside 200 ms even at 6x CPU
  oversubscription, and the old test did not fail in 20 runs under that load.
  So the Linux margin is real, which is consistent with this being reported
  only on windows-latest.

What remains inference: that readiness specifically crossed 200 ms on that
Windows run. There is no Windows runner here to measure it on. It rests on this
repository's own recorded observation of >850 ms delivery gaps on that runner
(`events.test.ts:81-84`) and on ReadDirectoryChangesW plus a filter driver
sitting in the I/O path. The fix does not depend on which Windows path fired,
because the test no longer races the watcher at all.

Fixed, in this card's scope:

- The test polls `/api/v2/metrics` until the watcher reports handles, instead
  of sleeping at it, and skips on `unavailable` the way the file's first test
  already does.
- It waits for the frame under test rather than for any frame, and a failure
  now names which of the three it hit — never arrived, arrived slowly, or the
  stream died — including the watcher's mode and directory count.
- `probe()` armed its 500 ms allowance around its own `mkdir` and two writes
  rather than around the notification it exists to measure (`watcher.ts:203`).
  Hardening rather than a measured cause: on Linux that setup is at most 8.8%
  of the allowance even at 6x load. On Windows it is the difference between a
  slow disk and a watcher condemned for the life of the process.

Verification: 227 + 7 tests pass, strict holds at baseline, and the SSE test
passes 20 of 20 under 3x CPU oversubscription. The Windows criterion is
untouched by any of that and is why this is `review` and not `done`.

Found on the way: [[T-0112]] (hello promises a channel that may not be live,
and a degraded watcher is cached forever) and [[T-0113]] (the watcher drops
fs.watch's two re-enumerate signals).
- 2026-08-02 18:58Z illodev@local#aed59c5e — Verified on the Windows runner. Green across every run since the fix.

Eight `windows-latest` jobs over four commits (Node 22 and 24 each), all green:
runs 30757773942, 30759105550, 30760567235 and 30762113959. In the last two I
read the assertion line out of the log directly — `ok - the SSE channel reports
writes made outside the server`, 340 ms and 512 ms; in the first two the job
being green is the evidence, since a failing test fails the step.

The literal criterion asked for repeated runs of one commit. What this is
instead is four different commits, twice each — broader coverage, and worth
naming rather than glossing, because the two are not the same claim. The reason
that is enough here is that the fix is structural: the test no longer contains
the race. It waits for the watcher to report handles before writing, so there
is no window left to lose the write in, rather than a smaller one.

The part that would have made a green run meaningless: this test returns early
when the watcher is unavailable, so it can pass by doing nothing. It did not.
The first test in the file has the same early return and instead ran for 8.3 s
and printed its diagnostic on both Windows jobs — which it only reaches after
`started.mode === "watch"`. So `fs.watch` armed on that runner and the SSE test
did its work.

Closing this as done. The third criterion is met by what the evidence supports,
which is stated above rather than implied by a checkmark.
