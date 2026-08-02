---
id: CHG-0061
title: A second project's board no longer has to displace the first
type: fixed
area: ui
visibility: public
cards: [T-0101]
created: 2026-08-02
updated: 2026-08-02
---

`ui.port` is `4747` in every workspace, so the second repository a user opened
could not start its board:

```
INTERNAL_ERROR: listen EADDRINUSE: address already in use 127.0.0.1:4747
```

The code reserved for a bug in Workfile itself, carrying a raw Node string, for
the most predictable failure the command has — with no mention of `--port`, of
`ui.port`, or of the fact that the holder was almost certainly the board the
user had just been looking at. What it invited was killing the first server,
which is what made the interface feel like it could only hold one project.

A port nobody named now moves aside: the board comes up on the next free one
and names the project holding the port it wanted, found by probing the API a
Workfile UI serves rather than by guessing. A port somebody named does not
move — an explicit `--port` that is taken fails with `UI_PORT_IN_USE` and the
same diagnosis. Set `ui.port` per project to keep each board at a stable
address.
