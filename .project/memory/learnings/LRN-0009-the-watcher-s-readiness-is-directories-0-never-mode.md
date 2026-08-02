---
id: LRN-0009
title: The watcher's readiness is directories > 0, never mode
status: active
created: 2026-08-02
updated: 2026-08-02
---
`/api/v2/metrics` reports the watcher as `{ mode, directories }`. Only
`directories` answers "is it up".

`mode` is initialised to `"watch"` when the watcher is constructed and is only
ever written again to degrade it, so it reads `"watch"` on a watcher that has
started nothing. Confirmed by measurement: 20 ms after subscribing,
`/api/v2/metrics` returns `{"mode":"watch","directories":0}`. A readiness check
written against `mode` passes instantly and proves nothing.

This matters because the server starts the watcher lazily and does not await
it — `void ensureWatching()` at `http.ts:768` — so the SSE `hello` frame is
flushed while `start()` is still probing the platform and placing handles.
Anything written into the workspace before those handles exist is not
delivered late, it is lost: `fs.watch` does not report writes that predate the
handle, and nothing rescans.

So any test that writes into a watched directory and expects an event must
poll `/api/v2/metrics` until `directories > 0` first. A sleep is a guess at a
window measured at ~32 ms idle on Linux and bounded above only by the probe's
own ceiling — it holds on a developer machine and is the whole reason
[[T-0109]] flaked on the Windows runner.

See [[T-0112]] for whether `hello` should mean the channel is live, which is
the fix that would make this unnecessary.
