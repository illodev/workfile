---
id: T-0112
title: The SSE stream says hello before the watcher is watching
status: done
type: bug
priority: medium
area: core
scope: [packages/workfile/src/server/http.ts, packages/workfile/ui/src/store/live.ts]
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

- [x] A client can tell when the push channel is live, or the server does not
      answer until it is
- [x] A watcher that came up unavailable is retried rather than cached for the
      life of the process
- [x] The chosen trade-off is recorded, because it is a change to what `hello`
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
- 2026-08-02 18:05Z illodev@local#aed59c5e — The decision, since the third criterion asks for it on the record.

This card offered two shapes: `await ensureWatching()` so `hello` means the
channel is live, or a separate signal carrying the watcher's state. Took the
second, and the first turns out not to solve the problem at all — worth writing
down because it is the one the card led with.

`start()` can finish with `mode: "unavailable"`. Awaiting it would delay the
response and then send the same `hello` it sends today, still saying nothing
about a channel that will never deliver. It buys latency and answers a
different question. The failure is not that `hello` is early; it is that
`hello` is silent.

And the client makes that concrete. `ui/src/store/live.ts:64` called
`stopFallback()` on `hello` — the board stopped polling because the socket
opened. On a filesystem `fs.watch` says nothing about, that left it with no
stream and no poll, silently, which the module's own comment (line 24) names as
the outcome the fallback exists to prevent. So the client needs the state as
data, not the response later.

Shipped: `hello` carries `{ watcher: { mode, directories } }`, a `watch.state`
event announces the watcher settling, and the board stops polling only on
`mode === "watch"`. When pushing begins it emits one reset, because whatever
happened while nothing was watching was missed.

The trade this makes: one added frame type on a published channel. Additive and
ignorable — a client that does not listen for `watch.state` behaves exactly as
before — which is why it was preferable to changing what `hello` means for
every existing consumer.

Second criterion: a degraded verdict is no longer cached. Retried on a later
subscriber, throttled to once every thirty seconds so a genuinely silent
filesystem is not re-probed on every `EventSource` reconnect. The interval is
exposed as `watchRetryMs` on `startProjectServer`, which is what made it
testable and is worth raising on a mount known to be silent.

Verified from a real server, not reasoned:

    hello del primer cliente:  {"mode":"pending","directories":0}
    watch.state emitido:       {"mode":"watch","directories":14}
    hello del segundo cliente: {"mode":"watch","directories":14}

    1er intento (probe roto):  {"mode":"unavailable","directories":0}
    2o intento (ya reparado):  {"mode":"watch","directories":14}

The retry test induces the failure with a file where the probe wants its
directory, so `mkdir` fails. Revoking permissions was the first attempt and was
rejected: `chmod` is a no-op on the Windows runner, and this suite runs there.

232 + 7 tests pass, strict holds at baseline, the UI typechecks.
- 2026-08-02 18:08Z illodev@local#aed59c5e — Client half verified in a real browser, which is what moves this to done rather
than review.

    watcher sano   -> el indicador dice "sse live"
    probe roto     -> el indicador dice "polling"

Chromium against a live server on a bench workspace, the second with a file
where the probe wants its directory. The board is genuinely polling in the
second case, not merely labelled as such.

The before-state is a code reading rather than a measurement, and worth marking
as such: `live.ts:64` called `stopFallback()` on `hello` unconditionally, and
nothing else started the fallback except `onerror` — which does not fire here,
because the stream is open and healthy, it just has nothing behind it. So the
board stopped polling and the indicator kept its default. Short enough a chain
to read off the committed file; I did not rebuild the old bundle to watch it
happen, because the checkout is shared with another session right now and
swapping files under it is not worth the evidence.

One thing the browser run caught that reasoning had not: the indicator re-reads
the connection mode only when a change arrives (`useWorkspaceChanges` sets it
inside the subscribe callback), so on a dead watcher it would have kept
claiming "sse live" for the thirty seconds until the first fallback tick — the
polling correct, the label wrong. `watch.state` now emits a reset whichever way
the watcher settled, which both refetches what was missed and settles the
label.

232 + 7 tests pass, strict at baseline, UI typechecks and builds.

## Activity

- 2026-08-02 17:58Z illodev@local#aed59c5e · claimed
- 2026-08-02 18:05Z illodev@local#aed59c5e · doing → review
- 2026-08-02 18:08Z illodev@local#aed59c5e · claimed
- 2026-08-02 18:08Z illodev@local#aed59c5e · doing → done

