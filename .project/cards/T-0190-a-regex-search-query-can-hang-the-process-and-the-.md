---
id: T-0190
title: A regex search query can hang the process, and the caps do not stop it
status: backlog
type: bug
priority: high
area: core
created: 2026-08-05
updated: 2026-08-05
---

`search` accepts a `/pattern/flags` query ([[CHG-0021]]) and compiles it with `new RegExp`. Three guards already bound it — the pattern is capped at 256 characters, flags are a subset of `imsu`, and each record body is truncated to 20,000 characters before matching. None of them bounds *backtracking*.

Measured with `/(a+)+$/`, six characters, well inside every cap:

| body | time |
|---|---|
| 20 chars | 104ms |
| 24 chars | 232ms |
| 28 chars | 3,717ms |
| 30 chars | 14,342ms |
| 32 chars | 57,113ms |

Two more characters is roughly four times the work. Against the 20,000-character body cap it does not finish.

On the CLI this is self-inflicted: your own query, your own terminal, Ctrl-C. What makes it a bug rather than a footgun is the HTTP surface. `/api/v2/search?q=` takes the same query, the rebinding guard covers cross-origin but not a request that is allowed to arrive, and `workfile ui --host 0.0.0.0` puts it on the network — the configuration the CI workflow itself describes as "unauthenticated read and write access to a repository".

This is CodeQL alerts #19 and #20 (`js/regex-injection`). They are **not** false positives, which is why they are a card and not a dismissal.

No obvious cheap fix, which is the other reason this is a card:

- **Reject nested quantifiers.** A heuristic, never complete, and it would refuse legitimate patterns.
- **Run the match under a deadline.** Node has no regex timeout; it needs a worker thread, and the match loop is currently synchronous inside an async function.
- **Use a linear-time engine.** RE2 is the correct answer and a native dependency, which this package has avoided everywhere else.
- **Drop user-supplied regex.** Honest, and removes a documented feature.

## Acceptance criteria

- [ ] A catastrophic pattern cannot hold the process past a bounded time
- [ ] The HTTP search path is bounded whether or not the CLI one is
- [ ] Whichever route is taken says what it costs the regex feature
