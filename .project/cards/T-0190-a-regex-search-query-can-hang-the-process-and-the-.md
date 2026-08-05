---
id: T-0190
title: A regex search query can hang the process, and the caps do not stop it
status: review
type: bug
priority: medium
area: core
created: 2026-08-05
updated: 2026-08-05
scope: [packages/workfile/src/modules/search]
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

- [x] A catastrophic pattern cannot hold the process past a bounded time
- [x] The HTTP search path is bounded whether or not the CLI one is
- [x] Whichever route is taken says what it costs the regex feature

## Activity

- 2026-08-05 17:42Z illodev@local#2cddaf94 · claimed
- 2026-08-05 18:03Z illodev@local#2cddaf94 · doing → review

## Notes

- 2026-08-05 17:55Z illodev@local#2cddaf94 — Route chosen by Álvaro after pricing the three that survived: worker thread with a deadline. RE2 and recheck were both out before the question was asked — this package has zero runtime dependencies (only @types/node), and a native or WASM dep would break a property it holds deliberately everywhere else. Measured on 250 records / 508KB: 5.4ms in-process against 53ms through a worker, so ~50ms of startup and structured clone, paid only by a /pattern/flags query. The deadline is 2000ms, roughly 370x the work a real query does. Everything touching the compiled expression moved into the worker, counts and excerpt line both, because a matcher that can hang hangs wherever it is used — leaving matchedLine in the parent would have kept the hole open on exactly the records that matched. End to end on a workspace with a 400-character run of 'a': SEARCH_REGEX_TIMEOUT in 2.189s where before it did not return. Priority lowered to medium: Álvaro runs the UI on loopback only, so the remote-DoS reading does not apply to his use — the fix protects anyone who binds wider regardless.
