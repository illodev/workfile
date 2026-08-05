---
id: T-0027
title: Hybrid search scores the first N records by index order, not query candidates
status: done
type: bug
priority: medium
area: core
created: 2026-07-30
updated: 2026-08-05
---

## Context

`searchProjectRecordsHybrid` (src/modules/search/search.ts) builds the provider's
candidate set as:

```js
const providerCandidates = candidates.slice(0, Math.max(1, Math.min(5000, maxProviderRecords)));
```

`candidates` is the record list filtered by kind only, in index order. So the semantic
provider always scores the FIRST `maxProviderRecords` records of the corpus — a fixed,
query-independent slice — and everything beyond it silently never gets a semantic score.

## Observed in a real workspace

Fube: ~3,800 records, default cap 500 → 87% of the corpus invisible to the provider.
Query "un cliente no me paga y quiero reclamar la deuda": the workspace HAS dunning
content (a payment-reminders help doc, cards, changelog entries) that plain lexical
finds under matching vocabulary, but hybrid returned unrelated noise — the relevant
records live beyond index 500, so the provider re-ranked junk. Raising
maxProviderRecords to 5000 in the consumer config works around it at the cost of
embedding the full corpus (cached by content hash, so one-off).

## Why it matters

The point of a semantic layer is exactly the query whose vocabulary lexical misses; an
index-order slice defeats it on any workspace past the cap, and nothing warns. This is
the "no silent caps" trap: the result reads as "searched everything" when it did not.

## Proposed fix (either, or both)

- Select provider candidates by lexical relevance (top-N of the lexical ranking, padded
  with recent records), not index order — keeps the cap meaningful.
- Emit a warning in the result envelope when records.length > maxProviderRecords, so
  hosts and the UI can surface the blind spot.

## Acceptance

- [x] A record beyond the cap that answers the query semantically can be returned
- [x] The fallback listed here — truncation visible in the search result
      metadata — was never needed, because #1 was achieved. Settled
      2026-08-05 under T-0174: no truncation flag exists, and T-0147 owns
      that question.

## Notes

- 2026-07-30 — found trialing @illodev/workfile-search-local on Fube right after 0.1.2.
- 2026-07-30 21:01Z claude-opus-2167a9c2 — 2026-07-30 — Fixed in 8d158d9. T-0026: guarded import taught in the search-local README, the root README's new first-party section and the example config. T-0027: provider candidates are lexical hits first, filler after, with a test planting the only match beyond the cap. T-0028: numThreads (default half the cores), per-batch cache persistence proven by a kill-mid-pass test, stderr progress. Suites 165/165. Ships with the next release; done when a consumer workspace verifies it.
- 2026-07-30 21:18Z claude-opus-2167a9c2 — 2026-07-30 — VERIFIED ON A CONSUMER (Fube, ~3.200 records) with 0.1.3 published. T-0028: full-corpus warm-up embedded 2,673 records in ~10 min with the machine USABLE throughout (default half-cores cap; the 0.1.2 provider froze the desktop twice on the same corpus), stderr progress visible to the last batch, incremental cache observed live mid-pass (508→1,916→3,181). T-0027: records beyond the old index-order cap now reach the provider — a semantically relevant card (T-0498) surfaced from deep in the corpus where 0.1.2 returned pure noise. T-0026: Fube's guarded config loaded on a clean git-archive clone and its CI job ran green. Runtime evidence complete.
- 2026-08-05 12:02Z illodev@local#2cddaf94 — Verified 2026-08-05 under T-0174. #1 holds twice over: search.test.ts plants the only lexical match at index 55 of 60 records with `maxProviderRecords: 10` and asserts both that T-0055 reaches the provider and that the cap itself still holds; and the 2026-07-30 21:18Z note records T-0498 surfacing from deep in Fube's corpus where 0.1.2 returned noise.

#2 was the fallback — `Or at minimum` — and was never needed, because #1 was achieved. The criterion text now says that rather than standing as an unmet requirement: a checkbox cannot express an alternative, and doctor counted it as unproven work for five days. There is no truncation flag in the result envelope; T-0147 owns that question.

## Activity

- 2026-07-30 21:01Z unknown · backlog → review
- 2026-07-30 21:18Z unknown · review → done
