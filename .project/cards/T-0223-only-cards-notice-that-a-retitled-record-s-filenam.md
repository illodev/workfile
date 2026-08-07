---
id: T-0223
title: Only cards notice that a retitled record's filename went stale
status: done
type: bug
priority: low
area: core
tags: [health]
effort: S
scope: [packages/workfile/src/modules/health, packages/workfile/src/modules/memory, packages/workfile/src/modules/docs, packages/workfile/src/modules/changelog]
origin: [LRN-0033]
created: 2026-08-07
updated: 2026-08-07
verified:
  at: "2026-08-07T22:58:22.788Z"
  method: local
  commit: 9cfb0175194fc944ab34f527c800adf4c1b486d2
  digest: "sha256:5efda4a8354950bd3d335c443a3dc01b1322f0ea7a1ba1395fd32aacc719fd49"
---

`diagnoseCards` reports `filename-stale` when a card's filename no longer matches its title, and `doctor --fix` renames it. The comment there states the reason plainly: the filename is the handle people and agents grep by, and a stale one misdirects long after anyone remembers the rename.

Memory records, documents and changelog fragments derive their filenames from their titles in exactly the same way, and none of them has the rule. So retitling a learning through `memory patch` leaves a file named after a title the record no longer has, and nothing reports it — found by doing it: LRN-0033 was retitled and sat under `LRN-0033-a-card-outlives-the-decision-it-was-filed-under-...` with `doctor` reporting 0 errors and 0 warnings. It was renamed by hand, which is the only repair available.

Worth doing as one pass rather than per collection, and worth doing at all for the same reason it was worth doing for cards: the drift is invisible, it accumulates on exactly the records that got the most attention, and `--fix` already exists as the shape of the repair.

## Acceptance criteria

- [x] `doctor` reports a stale filename for a memory record, a managed document and a changelog fragment, as a warning, the way it does for a card.
- [x] `doctor --fix` renames them, and a record whose id is referenced elsewhere keeps resolving.
- [x] The rule is written once rather than per collection.
- [x] A record whose filename is stale because it was renamed *by hand* to something legitimate is not fought over — state what happens.
- [x] `pnpm run check` green, doctor 0/0.

## Activity

- 2026-08-07 22:17Z illodev@local#42eb42f5 · claimed
- 2026-08-07 22:58Z illodev@local#42eb42f5 · released

## Notes

- 2026-08-07 22:58Z illodev@local#42eb42f5 — local verification: One record of each kind created, retitled and repaired end to end with the shipped binary: four `filename-stale` warnings attributed to cards, memory, docs and changelog, then `doctor --fix` renamed all four, ids still resolve and doctor is quiet. On Fube the rule finds 53 findings that were invisible — 35 docs, 18 memory. The exclusions were checked rather than assumed: an indexed README is not compared, and a released fragment cannot even be retitled — the protocol answers CHANGE_FRAGMENT_RELEASED — so that exclusion covers a hand edit. The rule caught my own hand-rename of LRN-0033 one commit after I made it, which is what closed criterion 5.
