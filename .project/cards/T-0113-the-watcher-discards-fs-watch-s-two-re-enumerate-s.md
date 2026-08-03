---
id: T-0113
title: The watcher discards fs.watch's two re-enumerate signals
status: discarded
type: bug
priority: low
area: core
scope: [.project/cards]
related: [T-0109]
created: 2026-08-02
updated: 2026-08-03
---

Found while fixing [[T-0109]]. Not the cause of that flake, and stated as
inference rather than measurement — this repository runs on Linux locally, and
both paths below are effectively unreachable there.

`fs.watch` has two ways of saying "you missed something, re-enumerate", and
`watcher.ts` treats both as "nothing happened":

1. `watcher.ts:129` — `if (!name) return;`. libuv's Windows backend invokes
   the callback with a null filename when `ReadDirectoryChangesW` completes
   without being able to enumerate the changes. Node's own documentation says
   `filename` "is not always guaranteed to be provided" and to have fallback
   logic. Here the fallback is to drop it. On inotify a name accompanies every
   event of this shape, so the line is dead code on the dev machine.

2. `watcher.ts:148-151` — an `error` on a directory handle closes it and
   deletes it from the map, with no attempt to re-establish and no change to
   `mode`. The watcher then reports `mode: "watch"` and a quietly shrinking
   `watchedDirectories` while delivering nothing for that directory.

Both are total and silent for the affected directory: `pending` stays empty,
no timer is armed, and `/api/v2/metrics` still says the watcher is healthy.

The index reconciles on fetch, so the cost is latency rather than
correctness, per the contract in the module header. But the whole point of
the watcher is that nobody has to fetch to find out.

Worth instrumenting before fixing: neither path can be exercised on Linux, so
a fix would ship unverified. A counter on each branch, surfaced through
`/api/v2/metrics`, would say whether either fires on the Windows runner at all
before anything is built on the assumption that they do.

## Acceptance criteria

- [ ] A nameless event re-enumerates its directory rather than being dropped
- [ ] A directory whose handle errors is either re-established or reflected in
      the watcher's reported mode
- [ ] Evidence that either branch actually fires on Windows, rather than a fix
      for a path nobody has observed

## Activity

- 2026-08-02 18:25Z illodev@local#aed59c5e · claimed
- 2026-08-02 18:28Z illodev@local#aed59c5e · doing → blocked
- 2026-08-02 18:59Z illodev@local#aed59c5e · claimed
- 2026-08-02 18:59Z illodev@local#aed59c5e · released
- 2026-08-02 19:12Z illodev@local#aed59c5e · claimed
- 2026-08-02 19:12Z illodev@local#aed59c5e · released
- 2026-08-03 10:23Z illodev@local#bd44efc7 · claimed
- 2026-08-03 10:23Z illodev@local#bd44efc7 · doing → discarded

## Notes

- 2026-08-02 18:28Z illodev@local#aed59c5e — Instrumented, deliberately not fixed. This card argued for that order and the
measurements back it.

Both branches are unreachable on Linux, measured rather than assumed:

    borrar el directorio vigilado  -> error=false, eventos=[rename:watched, rename:watched]
    rafaga de 20 000 escrituras    -> 40 000 eventos, 0 sin nombre

So `fs.watch` on inotify names every event of this shape and does not report a
deleted watch directory as an `error` at all. A fix written here would be a fix
for a path this machine cannot produce, which is exactly what the third
criterion refuses.

Shipped instead: both branches now count. `watcher.dropped` reads
`{ nameless, errors }`, `/api/v2/metrics` carries it, and the watcher test
emits it as a TAP diagnostic:

    # fs.watch signals dropped on linux: {"nameless":0,"errors":0}

That line is the point. The suite runs on `windows-latest`, where the backend
is ReadDirectoryChangesW rather than inotify, so the next CI run answers what
could not be answered from here — and answers it in the log of a run that is
happening anyway, rather than needing someone to set up a Windows box.

Blocked on that run rather than on anyone's decision. What to do next depends
on what it says:

- `nameless` above zero means the platform is asking for a re-scan and being
  ignored, and the first criterion becomes a real fix with a real trigger.
- `errors` above zero means directories are silently falling out of the
  watch set while the reported mode still says everything is fine — which
  matters more now that [[T-0112]] made the interface act on that mode.
- Both at zero across several Windows runs is also an answer: the branches are
  defensive code for a case that does not arise in this workload, and the card
  closes as `discarded` rather than being fixed on principle.

232 + 7 tests pass, strict holds at baseline.
- 2026-08-02 18:59Z illodev@local#aed59c5e — First reading off the Windows runner, and it points at discarding this rather
than fixing it.

    check (windows-latest, 22)  # fs.watch signals dropped on win32: {"nameless":0,"errors":0}
    check (windows-latest, 24)  ℹ fs.watch signals dropped on win32: {"nameless":0,"errors":0}

Run 30762113959, the first CI run to include the counters. Both jobs, both
branches at zero — so on the runner, under a workload that writes 40 files in a
burst and drives a server, `ReadDirectoryChangesW` named every event it
delivered and no directory handle errored.

Two jobs of one commit is one data point, not the "several runs" this needs.
Deliberately not concluding from it yet. The counters ride along in every CI run
from now on at no cost, so the evidence accumulates on its own; the question is
answered by looking again in a few runs rather than by doing anything.

Worth stating the bar now, while there is nothing riding on it: if both stay at
zero across roughly ten Windows jobs of ordinary work, these branches are
defensive code for a case this workload does not produce, and this card closes
as `discarded` with the counters left in place. A single non-zero reading turns
it into a real fix with a real trigger, and the first criterion stops being
speculative.

One thing the reading already settles, which was not the question but is worth
having: the diagnostic only prints after the watcher reports `mode === "watch"`,
so it is also proof that `fs.watch` arms on the Windows runner at all. That was
an assumption in [[T-0109]] and is now measured.
- 2026-08-02 19:12Z illodev@local#aed59c5e — Corrected from `blocked` to `deferred`, which is what this actually is.

`blocked` says externally blocked, and nothing is blocking. The counters ride
along in every CI run at no cost, so the evidence arrives whether or not anyone
touches this card — there is no impediment for a reader to go and remove, which
is what `blocked` invites them to look for. Nor is the work itself blocked:
the two fixes could be written today. What stops that is a decision, not an
obstacle — the third criterion asks for evidence the branch exists before code
is written for it, and that was the point of the card.

So: deliberately postponed, waiting on readings that accumulate on their own.
The bar is in the note above — zero across roughly ten Windows jobs and this
closes as `discarded`, one non-zero reading and it becomes a real fix.

First card in this repository to sit in either state, so the distinction is
worth having got right rather than close enough.
- 2026-08-03 10:23Z illodev@local#bd44efc7 — The bar this card set has been met, twice over, and it splits the card rather than closing it whole.

Every Windows job of every CI run since the counters shipped, read out of the job logs:

    13 runs, 26 jobs on windows-latest 22 and 24, 2026-08-02 to 2026-08-03
    {"nameless":0,"errors":0} in all 26

The bar was "roughly ten Windows jobs of ordinary work". Every one of these ran the suite, which writes in bursts and drives a server, and neither branch fired once.

So the first criterion is answered and the answer is no: `ReadDirectoryChangesW` named every event it delivered on these runners. Node's documentation says `filename` is not guaranteed, and that remains true, but a fix written from the documentation rather than from an observation is exactly what the third criterion refuses. Discarded on evidence, with the counters left in place — a single non-zero reading in a future run is a new card with a real trigger, and it costs nothing to keep watching.

The second criterion is a different matter, and is why this card does not simply close. It was written as a Windows question and it is not one:

    handle.on("error", () => { dropped.errors += 1; handle.close(); watchers.delete(relativeDirectory); });

Nothing there is platform-specific. Any error on any established handle drops a directory out of the watch set while `mode` still reports `"watch"` and `/api/v2/metrics` still reports health — and [[T-0112]] has since made the interface act on that mode, so the lie now has a consumer. The vocabulary to tell the truth already exists a few lines below, where a watcher that cannot arm sets `mode = "unavailable"`.

The reason this card deferred rather than fixing — "a fix would ship unverified" — has also stopped being true since it was written. [[T-0140]] and [[T-0142]] both drove failures this machine cannot produce by injecting the primitive, and the watcher takes `watch` the same way. Carried to [[T-0143]] on those terms.
