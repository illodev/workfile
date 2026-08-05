---
id: CHG-0130
title: A regex search pattern can no longer hang the process
type: fixed
area: core
visibility: public
created: 2026-08-05
updated: 2026-08-05
---

`search "/pattern/flags"` now runs your expression in a worker thread with a
two-second deadline, and a pattern that exceeds it fails with
`SEARCH_REGEX_TIMEOUT` instead of holding the process.

The pattern was already capped at 256 characters, flags restricted to `imsu`
and bodies scanned only to their first 20,000 — three bounds on the input, none
of them a bound on backtracking. `/(a+)+$/` is six characters, passes all
three, and takes 57 seconds against a 32-character body. V8 offers no step
budget and no regex timeout, so a match already running cannot be interrupted:
the thread is the only unit of work with a stop button on it.

The ordinary cost is about 50 milliseconds of thread startup, paid only by
`/pattern/flags` queries. Lexical and hybrid search are unchanged.
