---
id: T-0113
title: The watcher discards fs.watch's two re-enumerate signals
status: backlog
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
