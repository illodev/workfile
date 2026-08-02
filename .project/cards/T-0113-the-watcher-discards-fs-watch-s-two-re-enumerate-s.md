---
id: T-0113
title: The watcher discards fs.watch's two re-enumerate signals
status: blocked
type: bug
priority: low
area: core
scope: [packages/workfile/src/core/watcher.ts]
related: [T-0109]
created: 2026-08-02
updated: 2026-08-02
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
