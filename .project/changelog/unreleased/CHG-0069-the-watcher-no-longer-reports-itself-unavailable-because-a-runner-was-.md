---
id: CHG-0069
title: The watcher no longer reports itself unavailable because a runner was busy
type: fixed
area: core
visibility: public
created: 2026-08-02
updated: 2026-08-02
---
`fs.watch` is confirmed at startup with a probe: write a file, wait for the
notification, and degrade to `mode: "unavailable"` if it never comes — because
a watcher that silently never fires is indistinguishable from a workspace
where nothing happens.

The 500 ms allowance for that answer was armed around the whole probe, so it
also paid for the `mkdir` and the two writes that set it up. On a loaded
machine — a CI runner, or any host with a filter driver in the file I/O path —
that setup could spend the allowance before the notification it was meant to
measure had a chance to arrive, and the watcher would report a working
filesystem as unavailable. The server caches that verdict, so live updates
stayed off for the life of the process.

The allowance now starts once the watch handle exists, which is the point from
which the platform is actually being measured.
