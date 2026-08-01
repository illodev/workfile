---
id: INC-0001
title: Concurrent card creation duplicates IDs at 12 processes, contradicting T-0019
status: resolved
severity: medium
created: 2026-08-01
updated: 2026-08-01
resolved_at: 2026-08-01
corrective_actions: [T-0077, T-0019]
---
## What happened

A competitive landscape study measured concurrent `card create` and found duplicate IDs. Reproduced independently: **6 of 6 trials** at M scale (500 cards) with 12 concurrent processes and distinct titles produced duplicate IDs — 10 duplicates across the six trials. All 12 cards were created each time, so the failure is silent: nothing errors, two files simply carry the same ID.

Not reproduced on a freshly initialised workspace with 8 processes. Corpus size widens the window between reading `nextCardSequence()` and writing the file.

## Why it was believed impossible

T-0019 states in writing: "Same-checkout races are already handled (id lockfile + exclusive file creation + retry)". It correctly identified that filenames carry the title slug and correctly concluded that this makes git merge two clones' cards silently — then treated the same-checkout case as covered. The title slug breaks both cases for the same reason.

`test/cards.test.ts:124` ("exclusive card creation resolves concurrent ID collisions") is two-way in-process `Promise.all`. It passes, and it did not reproduce the failure in any trial.

## Corrective action

T-0077. The reservation must re-verify the ID inside the held lock, and the regression test must use separate processes with distinct titles, asserting both zero duplicates and exactly N cards created.

## Durable lesson

A lock that protects a different key than the durable uniqueness guard is not a lock. Here the reservation keyed on the ID and `createFileExclusive` keyed on the path — and the path included the title, so two different titles were never mutually exclusive. When reviewing a reservation scheme, state which key the atomic durable operation enforces and check it is the same key the lock names.
