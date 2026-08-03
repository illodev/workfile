---
id: CHG-0097
title: Creating records concurrently on Windows waits its turn instead of failing
type: fixed
area: core
visibility: public
created: 2026-08-03
updated: 2026-08-03
cards: [T-0140]
---
Two agents creating cards at the same moment on Windows could see one of
them fail outright with `INTERNAL_ERROR: EPERM: operation not permitted`,
instead of waiting a few milliseconds for its turn.

The id reservation is a lockfile created exclusively, and every place that
inspected the failure knew one code for "somebody else got there first":
POSIX's `EEXIST`. Windows refuses a file whose last handle is still closing
with `EPERM` instead, and `EBUSY` when the refusal is a sharing violation, so
those fell through to a rethrow and reached the user as a fault. Nothing was
wrong with the workspace; the write simply arrived a moment early.

All three now count as contention wherever a create is retried — the id
reservation, the durable record write and the write lock — and the retry stays
bounded, so a lock that never clears still gives up rather than spinning. When
it gives up it reports which refusal ran out the clock, because a busy
repository and an unwritable cache directory otherwise fail identically.

`card renumber` reports the same collision as a conflict rather than an
internal error, and `--reslug` skips a name claimed underneath it, which is
what its contract already promised.
