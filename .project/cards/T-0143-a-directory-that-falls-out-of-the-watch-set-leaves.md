---
id: T-0143
title: A directory that falls out of the watch set leaves the watcher claiming health
status: done
type: task
priority: medium
area: core
created: 2026-08-03
updated: 2026-08-04
scope: [packages/workfile/src/core/watcher.ts, packages/workfile/src/server/http.ts, packages/workfile/test, packages/workfile/ui/src/store/live.ts]
origin: [T-0113]
---

Split out of [[T-0113]], which was discarded on evidence. That card asked two
questions about `fs.watch` signals the watcher throws away. Twenty-six Windows
jobs answered the first one — nameless events never arrive — and left this one
standing, because it was never really a Windows question:

```ts
handle.on("error", () => {
    dropped.errors += 1;
    handle.close();
    watchers.delete(relativeDirectory);
});
```

Nothing there is platform-specific. Any error on any established handle, from
any cause, drops a directory out of the watch set and nothing re-establishes
it. `mode` still reports `"watch"`, `watchedDirectories` shrinks quietly, and
`/api/v2/metrics` still reports health. The watcher goes on promising it will
tell you when something changes, for a part of the tree where it can no longer
keep that promise.

[[T-0112]] made the interface act on that mode: the UI stops polling once the
server says `watch`, so the lie now has a consumer that quietly goes stale.

## What honest looks like here

A handle that fails on a directory which no longer exists is not a broken
promise — a deleted directory has nothing left to report, and dropping it is
right. A handle that fails on a directory that is still there is a broken
promise, and there are only two honest answers: re-establish the watch, or
stop claiming `"watch"`.

Re-establishing also means events were missed while it was down, so a recovered
directory has to tell consumers to re-enumerate rather than pretending the gap
did not happen. `reset` is the signal that already exists for exactly that.

The degraded verdict has to reach the interface, not just the metrics endpoint.
`watch.state` is published once at `start()` and never again, so a watcher that
degrades later says nothing to a UI that has already stopped polling.

## Why it can be fixed now

[[T-0113]] deferred this because a fix would ship unverified: the branch cannot
be reached on the machine this is developed on. That reason expired.
[[T-0140]] and [[T-0142]] both drove failures this machine cannot produce by
injecting the primitive — `create`, `open`, `rename` — and proving the loop
red before green. The watcher takes `watch` the same way.

## Acceptance criteria

- [x] A handle error on a directory that still exists re-establishes the watch,
      bounded, rather than silently dropping it
- [x] A recovered directory reports a `reset`, because whatever happened while
      it was unwatched was not delivered
- [x] A directory that cannot be re-established stops the watcher claiming
      `"watch"`, and a directory that is simply gone does not
- [x] The degraded verdict reaches a connected interface, not only
      `/api/v2/metrics`
- [x] Every branch is driven by an injected `watch`, red before green, rather
      than by waiting for a platform to produce it

## Activity

- 2026-08-03 10:25Z illodev@local#bd44efc7 · claimed
- 2026-08-03 10:30Z illodev@local#bd44efc7 · doing → review
- 2026-08-03 10:37Z illodev@local#bd44efc7 · review → done

## Notes

- 2026-08-03 10:30Z illodev@local#bd44efc7 — Four branches, each driven by an injected `watch` rather than by waiting for a platform to break a handle. Proven red by removing the single `void recover(relativeDirectory)` line and rebuilding:

    not ok 1 - a handle error on a directory that is still there re-establishes the watch
    not ok 2 - a directory that cannot be re-established stops the watcher claiming watch
    ok 3     - a directory that is simply gone is dropped without a word
    not ok 4 - a handle that keeps failing is retried a bounded number of times

    --> restored: 4 pass; whole suite 268 pass, 0 fail; ratchet held at 588; UI typecheck clean

Test 3 passing in both states is the point of it: the old code was right about the deleted directory and wrong about everything else, and a fix that turned "gone" into a failure would have been a different bug. It guards the distinction rather than the change.

What the recovery actually does, in the order it decides:

1. Directory no longer on disk — dropped, silently, as before. Nothing left to report.
2. Attempts spent past `maxRecoveries` (3) — degrade.
3. Re-watch, and if that throws — degrade.
4. Re-watch succeeded — report a `reset`, because whatever happened while it was unwatched was never delivered and the consumer is behind.

`degrade()` sets `mode = "unavailable"` once, not once per directory, and calls the new `onState`. The server publishes that on `watch.state`, which the UI already handled for the "a later attempt succeeded" case: it resumes polling on any mode that is not `watch` and emits a reset. So the verdict reaches a client that had already stopped polling, which was the half of this that metrics alone could not fix.

Deliberately not done: a partial-coverage mode. The vocabulary is `watch` and `unavailable`, and inventing a third value would mean touching every consumer that reads it to teach them a distinction none of them can act on differently — the UI's only lever is whether to poll. One directory lost and the whole tree lost both mean "do not trust the stream".
- 2026-08-03 10:34Z illodev@local#bd44efc7 — The tests were wrong on four of the six CI jobs, and the fix was not. Run 30805871658: ubuntu green, both Windows and both macOS red.

    a handle error ... re-establishes the watch      0 !== 1
    a directory that cannot be re-established ...    Cannot read properties of undefined (reading 'emit')

Each test composed the watched path with `resolve(root, ".project/cards")` and looked the handle up by it. The watcher does not watch that path. `start()` puts the root through `realpath.native` deliberately — macOS answers `/private/var` for a `tmpdir()` that says `/var`, and a Windows runner's TEMP arrives as an 8.3 short name, which aborts the process if a watch is placed on it. That is documented in the watcher's own comments, five lines above the code under test.

So the assertion was reading a map keyed by the real path with a key built from the nominal one. On Linux the two are the same string and everything passed.

Fixed by reading the path back out of the stub — the test now asks which path was actually watched instead of asserting which one should have been. That is the more honest shape anyway: the stub records what the code did, and a test that recomputes it is duplicating the logic it is checking.

Nothing in `watcher.ts` changed.
- 2026-08-03 10:37Z illodev@local#bd44efc7 — Green across all eight jobs on run 30806140455, commit 8a7405b — ubuntu, macos and windows on Node 22 and 24. The four recovery branches run on every platform, since the failure is injected rather than waited for.

Closing on that, with the limit stated: what CI proves is that the recovery logic behaves as specified everywhere, not that a real `fs.watch` handle has ever errored in production. Nothing observed one — that was T-0113's whole finding, and it is why this was carded as the watcher lying about its own health rather than as a Windows bug. The code path is now correct whenever it does fire, and it costs nothing while it does not.
