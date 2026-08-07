---
id: T-0223
title: Only cards notice that a retitled record's filename went stale
status: backlog
type: bug
priority: low
area: core
tags: [health]
effort: S
scope: [packages/workfile/src/modules/health]
origin: [LRN-0033]
created: 2026-08-07
updated: 2026-08-07
---

`diagnoseCards` reports `filename-stale` when a card's filename no longer matches its title, and `doctor --fix` renames it. The comment there states the reason plainly: the filename is the handle people and agents grep by, and a stale one misdirects long after anyone remembers the rename.

Memory records, documents and changelog fragments derive their filenames from their titles in exactly the same way, and none of them has the rule. So retitling a learning through `memory patch` leaves a file named after a title the record no longer has, and nothing reports it — found by doing it: LRN-0033 was retitled and sat under `LRN-0033-a-card-outlives-the-decision-it-was-filed-under-...` with `doctor` reporting 0 errors and 0 warnings. It was renamed by hand, which is the only repair available.

Worth doing as one pass rather than per collection, and worth doing at all for the same reason it was worth doing for cards: the drift is invisible, it accumulates on exactly the records that got the most attention, and `--fix` already exists as the shape of the repair.

## Acceptance criteria

- [ ] `doctor` reports a stale filename for a memory record, a managed document and a changelog fragment, as a warning, the way it does for a card.
- [ ] `doctor --fix` renames them, and a record whose id is referenced elsewhere keeps resolving.
- [ ] The rule is written once rather than per collection.
- [ ] A record whose filename is stale because it was renamed *by hand* to something legitimate is not fought over — state what happens.
- [ ] `pnpm run check` green, doctor 0/0.
