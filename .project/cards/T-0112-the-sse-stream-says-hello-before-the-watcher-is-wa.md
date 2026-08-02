---
id: T-0112
title: The SSE stream says hello before the watcher is watching
status: backlog
type: bug
priority: medium
area: core
scope: [packages/workfile/src/server/http.ts]
related: [T-0109]
created: 2026-08-02
updated: 2026-08-02
---

Found while fixing [[T-0109]], which was the test paying for this.

`http.ts:768` starts the watcher with `void ensureWatching()` and returns
straight into `events.subscribe`, so the `hello` frame is flushed while
`start()` is still probing the platform and placing handles. A client that
receives `hello` has been told the stream is open; it has not been told the
push channel is live, and there is no frame that ever tells it.

Anything written into the workspace in that window is not delivered late, it
is lost: `fs.watch` does not report writes that predate the handle, and
nothing rescans. Measured locally the window is ~32 ms on an idle Linux box,
which is why this has never been noticed outside CI — but it is bounded below
by the probe, not by anything small, and the probe's own ceiling is 500 ms.

The second half is worse. `http.ts:683-686` memoizes the result:

```js
let watching = null;
const ensureWatching = () => {
    if (!watching) watching = watcher.start();
    return watching;
};
```

One unlucky probe therefore condemns the watcher for the life of the process.
A `mode: "unavailable"` verdict reached because a runner was busy for half a
second is indistinguishable, forever after, from a genuine network filesystem
— and the UI simply stops live-updating, silently, with no retry and nothing
in the interface saying so.

Two separable decisions, which is why this is a card rather than a patch:

1. Whether `hello` should mean "the channel is live" — i.e. `await
   ensureWatching()` before subscribing. It costs the stream open up to the
   probe ceiling, and the watcher is documented as a fast path that consumers
   must not depend on, so this trades startup latency for a guarantee the
   design deliberately does not make. The alternative is a separate frame
   announcing readiness, which adds protocol surface.
2. Whether a degraded verdict should be retried rather than cached.

## Acceptance criteria

- [ ] A client can tell when the push channel is live, or the server does not
      answer until it is
- [ ] A watcher that came up unavailable is retried rather than cached for the
      life of the process
- [ ] The chosen trade-off is recorded, because it is a change to what `hello`
      promises

## Notes

- 2026-08-02 16:36Z illodev@local#aed59c5e — Evidence that a false `unavailable` is reachable, which is the case for
retrying rather than caching the verdict.

An agent investigating [[T-0109]] claimed that stalling the event loop for
600 ms right after subscribing latches `mode` to `"unavailable"`. Checked, and
it does not reproduce that way: a synchronous stall right after
`ensureWatching()` lands before `probe()` even starts, because the
`realpath.native` callback cannot run on a blocked loop.

It does reproduce when the stall lands in the timers phase during the probe's
wait window, which is where the expired 500 ms timer can be serviced before
the poll phase delivers a notification that is already ready. Measured on
Linux, 8 runs per cell, counting a working filesystem wrongly reported
unavailable:

- timer armed around the whole probe (before T-0109): 1/8 at a 700 ms stall,
  0/8 at 1200 ms and 2000 ms
- timer armed after the watch handle (shipped in T-0109): 0/24
- as shipped, plus a `setImmediate` tie-break so an already-ready
  notification wins the timers-phase race: 0/24

So it is real but rare here, and the tie-break bought nothing measurable on
the one platform available — which is why it was not shipped. Windows is where
the ordering would bite, and there is no runner here to measure it on.

The conclusion for this card: a probe can be wrong, and no amount of tightening
the probe makes it right. What makes it safe is not caching the answer.
