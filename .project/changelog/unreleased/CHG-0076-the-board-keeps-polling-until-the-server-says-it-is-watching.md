---
id: CHG-0076
title: The board keeps polling until the server says it is watching
type: fixed
area: ui
visibility: public
created: 2026-08-02
updated: 2026-08-02
---
The board stopped polling the moment its event stream opened, and an open
stream is not a working one. The server starts its filesystem watcher on the
first subscriber and answers before it is up, and on a network filesystem or a
container mount the watcher can come up unable to deliver anything at all —
which is designed behaviour, and exactly what the fallback poll exists for. The
`hello` frame said nothing about any of it, so the board took an open socket as
proof and went quiet: no stream, no poll, and nothing on screen saying so.

`hello` now reports the watcher, and a `watch.state` event announces it
settling. Polling stops when the server says it is watching and not before, and
resumes if a later attempt says it cannot. When pushing does begin, the board
refetches once, because whatever happened while nothing was watching was
missed.

A watcher that came up unable to deliver is also no longer a permanent verdict.
The check behind it asks whether one filesystem notification arrived inside
half a second, which a loaded machine can fail on a filesystem that works
perfectly — and the answer was cached for the life of the process, so a bad
half second at startup turned live updates off until the server was restarted.
A later subscriber tries again, at most every thirty seconds so a genuinely
silent filesystem is not re-probed on every reconnect.
