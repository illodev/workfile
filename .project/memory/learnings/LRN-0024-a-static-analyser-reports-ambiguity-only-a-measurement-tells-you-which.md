---
id: LRN-0024
title: A static analyser reports ambiguity; only a measurement tells you which half is real
status: active
confidence: high
created: 2026-08-05
updated: 2026-08-05
---

Ten CodeQL alerts sat open on main, every one rated `high` by its rule. The
temptation in both directions is the same mistake: fix them all to clear the
tab, or dismiss them all because static analysis is noisy. [[T-0162]] said the
work was "saying which", and that turned out to be literal — the answer came
from a benchmark, not from reading the code.

Same rule, `js/polynomial-redos`, four sites, at 16× the input:

| site | growth |
|---|---|
| `acceptance.ts` ITEM | 1× |
| `records/index.ts` QUERY_TOKEN | 1× |
| `docs/validation.ts` link scan | **217×** |
| `docs/docs.ts` trailing slash | **230×** |

Two noise, two quadratic — and the quadratic ones were bad in a way reading had
not suggested: 43.6 seconds on a 128KB document body, in the scan the doctor
runs over every document in the workspace.

The reverse error was there too. `js/regex-injection` in `search.ts` looked
handled: a 256-character pattern cap, a flag allowlist, a 20,000-character body
cap. Three guards, none of which bounds backtracking. `/(a+)+$/` is six
characters and takes 57 seconds against a 32-character body ([[T-0190]]).

**A static analyser reports that a shape *can* be exploited. Whether it is
depends on the engine, the caps around it and the input that reaches it — three
things the analyser does not know and a benchmark answers in minutes.** The
measurement is also what makes a dismissal honest: "false positive" alone is an
opinion, and the same sentence with numbers in it is a claim someone can check.

Cheap enough that there is no excuse: each of these was a five-line script.
Related to [[LRN-0018]] — the gap is always narrower than it looks, and here it
was narrower in both directions at once.
