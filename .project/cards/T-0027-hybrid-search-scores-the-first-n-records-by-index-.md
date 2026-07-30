---
id: T-0027
title: Hybrid search scores the first N records by index order, not query candidates
status: backlog
type: bug
priority: medium
area: core
created: 2026-07-30
updated: 2026-07-30
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

- [ ] A record beyond the cap that answers the query semantically can be returned
- [ ] Or at minimum: the truncation is visible in the search result metadata

## Notes

- 2026-07-30 — found trialing @illodev/workfile-search-local on Fube right after 0.1.2.
