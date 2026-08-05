---
id: T-0166
title: The SSE test's 2000ms ceiling fails a loaded Windows runner
status: done
type: bug
priority: medium
area: infra
created: 2026-08-05
updated: 2026-08-05
---

`check (windows-latest, 24)` failed on PR #20 with:

```
✖ the SSE channel reports writes made outside the server (2650.8646ms)
  AssertionError: the event took 2243ms; this is meant to feel immediate
```

This is not [[T-0109]] returning. That card fixed a *lost* event — the test wrote before the watcher had handles, `fs.watch` does not report writes that predate the handle, and the failure was `0 !== 1`. Here `changes.length` passed and `event.data.paths` passed. The event arrived, was correct, and was slow.

So the diagnostic T-0109 added did its job: its second criterion was that a failure must say which of the two it is, and this one says. What it has surfaced is a different question — whether 2000 ms is the right ceiling for that runner — which T-0109 never asked, because after its fix Windows was delivering in 340 ms and 512 ms.

The PR that hit this touches no server, watcher or test code; its diff is scripts, media, README and `.project` records. windows-latest/22 passed on the same commit, and so did both ubuntu and both macos jobs.

What is not established: whether 2243 ms is runner contention on one occasion or a real regression in delivery latency since 0.6.0. The two need different answers and the evidence here cannot separate them — one observation, no Windows runner to measure on.

Worth naming: T-0109 wrote down that re-running until green launders a real signal, and that this repository once shipped three commits on a red CI because nobody looked. A re-run was triggered on PR #20 before that note was read. Whatever it returns is one more sample, not a verdict, and this card exists so the sample is not mistaken for one.

## Acceptance criteria

- [x] Delivery latency on the Windows runner is measured across runs rather than inferred from one
- [x] The ceiling is set from that measurement, or the regression behind it is found
- [x] A failure at the ceiling stays distinguishable from a lost event

## Notes

- 2026-08-05 10:05Z illodev@local#b2ee1fa3 — The re-run this card warns about came back at 435ms.

`check (windows-latest, 24)`, same commit, run 30995325157: `✔ the SSE channel reports writes made outside the server (435.8452ms)`. That is one sample, and it is the sample the card said would not be a verdict — 435ms against 2243ms on the same commit and the same runner image is the spread the measurement has to explain, not evidence there is nothing to explain.

It does place the observation with T-0109's post-fix numbers (340ms, 512ms) rather than apart from them, which narrows the question: the ceiling is 4x the typical delivery and one run still crossed it. Contention is the likelier reading of the two this card left open, but 'likelier' is where it stands.

PR #20 merged green on that re-run.
- 2026-08-05 10:22Z illodev@local#b2ee1fa3 — A second failure on the same job, and it is a different test.

PR #21 (records only — two card files, no code) failed `check (windows-latest, 24)` on `events.test.ts:117`:

```
✖ the watcher covers the corpus, coalesces bursts and ignores the cache (10349ms)
  AssertionError: a burst coalesces into one batch
  3 !== 1
```

The SSE test passed in that same run, at 518ms. So this is not this card's ceiling firing again — it is [[T-0006]], 'Watcher burst still flaky on Windows runners with a 250 ms quiet period', which is also closed as `done`.

What the two occurrences share is narrower than 'flaky CI', and worth writing down before it is lost:

- Both are in `events.test.ts`, the only file that exercises the watcher against the clock.
- Both are on `windows-latest, 24` specifically. `windows-latest, 22` passed on both commits, as did both ubuntu and both macos jobs.
- Both come from cards previously closed with runtime evidence, on runs whose diffs could not have caused them (PR #20 was scripts and media; PR #21 was two Markdown records).
- Neither reproduced: the SSE test passed on re-run, and the merge commit for #21 went green on main.

Node 24 on Windows is the variable that separates the failing job from the passing one. Whether that is a real difference in `fs.watch` delivery under that runtime or the two jobs simply landing on different runner load is the thing to measure — and it is the same measurement this card already asks for, so it belongs here rather than in a third card.

Both merges are green on main. Nothing shipped red.
- 2026-08-05 13:00Z illodev@local#2cddaf94 — Measured. 239 samples of this test from the logs of 40 CI runs across all six runner configurations, harvested with `gh api /actions/jobs/ID/logs`.

```
  macos    node 22   p50  284   p90  350   max  544
  macos    node 24   p50  285   p90  334   max  544
  ubuntu   node 22   p50  371   p90  413   max  481
  ubuntu   node 24   p50  383   p90  422   max  451
  windows  node 22   p50  435   p90  714   max 1208
  windows  node 24   p50  595   p90 1105   max 1632
```

The card's open question closes on the contention side: 2243ms ranks above all 79 Windows samples, so it is an outlier beyond the distribution rather than a shift in it. But the reading is sharper than 'runner load'. Node 24 is where the tail lives — paired by commit, slower than node 22 on 62% of the runs both executed, median +90ms, worst +1219ms. The medians barely separate; the spread does. ubuntu spans 168ms between best and worst over 80 samples, Windows node 24 spans 1280ms.

So 2000ms was four times the worst ever seen on macOS and Linux and 1.2 times the worst on Windows. Windows now carries 4000ms, everything else keeps 2000, and the table is in the test beside the number.

The wait window is twice the budget rather than a fixed 3000ms, so criterion #3 still holds under the larger number: a loop that gave up at the budget would report every late delivery as a lost one.

`t.diagnostic` now reports the latency on every run, pass or fail. That is the part that matters beyond this card. The harvest was expensive for a reason nothing in the repository stated: node 22 defaults to the TAP reporter off a TTY and node 23+ defaults to spec, so the same suite reports durations in two shapes across the matrix, and the first parser silently found only half the jobs. One diagnostic line is greppable from any of them.

Filed [[T-0179]] for the other failure this card recorded: the burst test's floor is identical everywhere at ~8.1s, and only Windows node 24 has slack above it — up to 5.2s. It fails because the writes spread past the 250ms quiet period, not because the coalescer misgroups, and widening a budget cannot fix it since the number under pressure is the quiet period itself. [[LRN-0021]] records the measurement method.
- 2026-08-05 17:20Z illodev@local#2cddaf94 — Runtime evidence: merged to main in PR #22 (fea0cff..bda003c) and verified by the full CI matrix on the merge commit — ubuntu, macos and windows on node 22 and 24, plus smoke, doctor and codeql, all green. 328 tests + 7 search-local, strict ratchet held at 494.

## Activity

- 2026-08-05 12:38Z illodev@local#2cddaf94 · claimed
- 2026-08-05 13:00Z illodev@local#2cddaf94 · doing → review
- 2026-08-05 17:20Z illodev@local#2cddaf94 · review → done
