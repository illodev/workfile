---
id: CHG-0098
title: Writing a record while something reads it no longer fails on Windows
type: fixed
area: core
visibility: public
created: 2026-08-03
updated: 2026-08-03
cards: [T-0142]
---
Every durable write in Workfile lands with a rename, and on Windows a rename
is refused while anything at all holds the destination open. Anything includes
the product's own readers: the index, the watcher, the HTTP server and the UI
all read the records the CLI writes. The write failed outright with `EPERM`
where it should have waited a few milliseconds for the reader to finish.

Measured on the Windows runners rather than assumed. One `fs.open(path, "r")`
from the same process is enough to cause it, every share mode is refused —
including the one that permits deletion — and every refusal cleared within
100ms of the reader letting go.

The rename now waits, for half a second at most. A destination somebody keeps
open for longer still fails, and it fails with its own errno rather than with
an invented one, because a caller needs to know what is holding the file. A
read-only destination is refused with that identical code and waiting cannot
fix it, so the destination is asked whether it is writable at all before any
of the waiting starts: that case still fails immediately.

Uploading an asset over the HTTP API answers "an asset with that name already
exists" for the Windows form of the same refusal, where it used to answer 500
— and only when the name really is taken, so an assets directory nobody may
write to is not reported as a name collision.
