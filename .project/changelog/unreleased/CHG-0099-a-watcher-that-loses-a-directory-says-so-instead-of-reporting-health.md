---
id: CHG-0099
title: A watcher that loses a directory says so instead of reporting health
type: fixed
area: core
visibility: public
created: 2026-08-03
updated: 2026-08-03
cards: [T-0143]
---
The watcher used to drop a directory whose handle failed, and go on
reporting `mode: "watch"` with a quietly shrinking watch set. Nothing
re-established it, `/api/v2/metrics` still reported health, and the interface
— which stops polling the moment the server says it is watching — sat on a
stream that had stopped covering part of the tree.

A handle that fails on a directory which is still there is now re-established,
up to three times, and the recovery reports a `reset` because whatever
happened while it was unwatched was never delivered. A directory that cannot
be re-established, or that keeps failing, ends the claim: the watcher reports
`unavailable` and announces it on `watch.state`, so a client that already
stopped polling starts again.

A directory that simply no longer exists is still dropped without a word. A
deleted directory has nothing left to report, and treating that as a failure
would be its own kind of lie.
