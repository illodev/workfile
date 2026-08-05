---
id: T-0166
title: The SSE test's 2000ms ceiling fails a loaded Windows runner
status: backlog
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

- [ ] Delivery latency on the Windows runner is measured across runs rather than inferred from one
- [ ] The ceiling is set from that measurement, or the regression behind it is found
- [ ] A failure at the ceiling stays distinguishable from a lost event

## Notes

- 2026-08-05 10:05Z illodev@local#b2ee1fa3 — The re-run this card warns about came back at 435ms.

`check (windows-latest, 24)`, same commit, run 30995325157: `✔ the SSE channel reports writes made outside the server (435.8452ms)`. That is one sample, and it is the sample the card said would not be a verdict — 435ms against 2243ms on the same commit and the same runner image is the spread the measurement has to explain, not evidence there is nothing to explain.

It does place the observation with T-0109's post-fix numbers (340ms, 512ms) rather than apart from them, which narrows the question: the ceiling is 4x the typical delivery and one run still crossed it. Contention is the likelier reading of the two this card left open, but 'likelier' is where it stands.

PR #20 merged green on that re-run.
