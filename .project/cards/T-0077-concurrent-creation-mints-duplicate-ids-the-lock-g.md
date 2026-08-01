---
id: T-0077
title: "Concurrent creation mints duplicate IDs: the lock guards the ID, not the path"
status: review
type: bug
priority: high
area: core
created: 2026-08-01
updated: 2026-08-01
scope: [packages/workfile/src/modules]
---

The reservation lock at `.project/.cache/locks/ids/<ID>.lock` protects the **ID**. The durable guard — `createFileExclusive(path)` — protects the **path**, and the path is `${id}-${slugify(title)}.md`. Two processes with different titles never collide on the path, so the second writes a second file carrying the first one's ID. The lock is released in `finally` the moment the file is written, so a process that read `nextCardSequence()` before that write still believes the ID is free.

`mutations.ts:285-315`. The same shape is in `docs.ts`, `memory.ts` and `changelog.ts`.

## Evidence

Reproduced at M scale (500 cards) with 12 concurrent `card create` processes using distinct titles: **6 of 6 trials produced duplicate IDs, 10 duplicates total.** Does not reproduce on a freshly initialised workspace at 8 processes — corpus size widens the window.

Identical titles do NOT reproduce it: the path collision masks the bug. Any test must use distinct titles.

## The written belief this corrects

T-0019 states "Same-checkout races are already handled (id lockfile + exclusive file creation + retry)". It diagnosed the title-slug mechanism correctly for the cross-clone case and drew the boundary in the wrong place.

`test/cards.test.ts:124` is two-way in-process `Promise.all`; it did not reproduce this in any trial and is the source of the false confidence.

## Fix

Re-verify the ID is unclaimed *inside* the held reservation, then `createFileExclusive`. The directory listing must be domain-complete — recursive for docs, which nest in folders. Extract one `reserveRecordId` helper so the four sites cannot drift.

Assert both zero duplicates **and** exactly N cards created: an over-strict fix trades duplicates for spurious `CARD_ID_ALLOCATION_FAILED`.

Breaks the published guarantee "collision-safe ID reservations" (README).

## Activity

- 2026-08-01 16:10Z agent:claude · claimed
- 2026-08-01 16:10Z agent:claude · claimed
- 2026-08-01 16:26Z agent:claude · doing → review

