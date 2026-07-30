---
id: T-0019
title: "Heal duplicate card IDs after merges: card renumber and doctor fix"
status: done
type: feature
priority: high
area: core
created: 2026-07-30
updated: 2026-07-30
scope: [src/modules/cards, src/modules/health, bin/workfile.ts, test]
---
## Problem

Card IDs are allocated by scanning the local max sequence and adding 1. Same-checkout races are already handled (id lockfile + exclusive file creation + retry), but two clones or worktrees allocate the same ID independently, and because filenames include the title slug, git merges both files silently. Today `doctor` reports `duplicate-record-id` and mutations fail with `CARD_ID_AMBIGUOUS`, but nothing heals the workspace.

## Design

- `workfile card renumber <id|file> [--to ID]`: reassigns a card to the next free sequence — rename the file, rewrite frontmatter `id`, and rewrite every reference across all records using the existing link graph (frontmatter `parent`/`depends`/`related` lists and `[[T-NNNN]]` body mentions).
- Deterministic loser selection when healing a duplicate pair: the younger `created` moves; tie-break by fewer incoming references, then path.
- `doctor --fix` (or an explicit fix subcommand) applies the healing for every `duplicate-record-id` issue.
- Prevention across clones without central coordination is impossible by design; detection + healing keeps sequential human-readable IDs, which stay the default.

## Activity

- 2026-07-30 19:10Z claude-fable-e341b469 · claimed
- 2026-07-30 19:20Z claude-fable-e341b469 · doing → done
- 2026-07-30 19:20Z claude-fable-e341b469 · released

## Notes

- 2026-07-30 19:20Z claude-fable-e341b469 — Implemented renumberCard + healDuplicateCardIds in src/modules/health/renumber.ts (avoids the cards<->records import cycle), CLI card renumber [--to|--duplicates] and doctor --fix, doctor hint on duplicate-record-id. Winner selection is deterministic (older created, then path) so both sides of a merge converge. References rewritten only when the moved ID was unique and only inside the protocol root; ambiguous ones returned as review[]. Evidence: 155/155 tests (test/renumber.test.mjs + CLI case), strict ratchet held, live demo on a fixture copy: doctor 2 errors -> heal T-0001 -> T-0003 -> doctor 0 errors. CHG-0006.
