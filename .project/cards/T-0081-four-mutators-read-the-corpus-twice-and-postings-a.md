---
id: T-0081
title: Four mutators read the corpus twice (and postings are not the win they looked)
status: done
type: task
priority: medium
area: search
created: 2026-08-01
updated: 2026-08-01
scope: [packages/workfile/src/modules/search, packages/workfile/src/modules/cards]
---
Two independent changes were proposed together. **One shipped; the other was measured and rejected.**

## Shipped: the corpus was read twice

`mutateCard` accepts a `snapshot` option (`mutations.ts:131/146`) and its own comment explains why: "Reloading it per card turned a bulk edit of twenty cards into twenty full directory reads." `claimCard`, `releaseCard`, `transitionCard` and `archiveCard` each loaded the corpus and then called `mutateCard` without passing it.

Four one-line changes.

**Measured**, 3,400 records, claim + transition in a loop:

- before: 667.7 ms per mutation
- after: 259.2 ms per mutation — **2.6x**

## Rejected: skipping the filter to preserve the search postings

The premise was right — `records.filter(...)` in `search.ts` returns a fresh array and the postings index is installed on the original with `defineProperty`, so hybrid search discarded the index it had just built. The conclusion was wrong.

**Measured**, 3,400 records, warm index, 20 runs:

| query | discarding postings | preserving them |
| --- | --- | --- |
| term in every record | 17.2 ms | **37.9 ms** |
| two-term phrase | 9.3 ms | **20.8 ms** |
| one matching record | 2.3 ms | 1.6 ms |
| no matches | 2.0 ms | 0.7 ms |

Postings only win when a query is highly selective. For anything common they cost more than scanning memoized tokens, and a term-at-a-time intersection over 3,400 records is not free. The end-to-end CLI could not tell the two apart at all: variance across runs was larger than the difference, because the index build dominates.

The landscape study's claim of ~45x came from comparing a **direct id lookup** (2.1 ms) against a **hybrid search** (96.4 ms) and attributing the whole gap to this line. Those are different operations.

Reverted. Preserving the postings would be a regression for typical queries. Making it pay off needs the field-scoped posting maps and term-at-a-time accumulation the study also describes — a real piece of work, not a five-line change, and it needs its own card and its own evidence.

## Evidence

- `pnpm run check`: 187 + 7 tests, strict ratchet 601 across 59 files, none new.
- Measurements above reproduced on a 3,400-record bench workspace via `scripts/bench-workspace.ts`.

## Activity

- 2026-08-01 16:26Z agent:claude · doing → review
- 2026-08-01 16:27Z illodev@local#e55eab30 · renamed file to T-0081-four-mutators-read-the-corpus-twice-and-postings-a.md
- 2026-08-01 16:46Z agent:claude · review → done

