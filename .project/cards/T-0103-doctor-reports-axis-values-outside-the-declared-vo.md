---
id: T-0103
title: doctor reports axis values outside the declared vocabulary
status: done
type: feature
priority: medium
area: core
scope: [packages/workfile/src/modules/cards/cards.ts, packages/workfile/bin/workfile.ts, packages/workfile/docs]
related: [T-0060]
created: 2026-08-02
updated: 2026-08-04
origin: [ADR-0008]
---

Per [[ADR-0008]]. Write-time validation only covers cards written after the
axis was declared. A repository that declares `context` on a hundred existing
cards needs to be told which ones do not carry it and which carry a value that
is not in the vocabulary — the same service `area` gets.

Also `card list --axis name=value`, so filtering does not have to go through
`search`. The query grammar already handles `context:treasury`; the listing
flags are a separate surface and currently have no way to express it.

A missing axis value is a warning, not an error: declaring an axis on an
existing repository must not turn every card red at once. An unknown value is
an error, because it is a typo that silently matches nothing.

## Acceptance criteria

- [x] An axis value outside the vocabulary is a doctor error naming the card
- [x] A card with no value for a declared axis is a warning, not an error
- [x] `card list --axis context=treasury` filters, and combines with the others

## Activity

- 2026-08-02 10:55Z illodev@local#e55eab30 · claimed
- 2026-08-02 11:02Z illodev@local#e55eab30 · doing → review
- 2026-08-02 11:02Z illodev@local#e55eab30 · released
- 2026-08-02 11:05Z illodev@local#e55eab30 · review → done

