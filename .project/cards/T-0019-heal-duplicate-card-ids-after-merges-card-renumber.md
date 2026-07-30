---
id: T-0019
title: "Heal duplicate card IDs after merges: card renumber and doctor fix"
status: backlog
type: feature
priority: high
area: core
created: 2026-07-30
updated: 2026-07-30
---
## Problem

Card IDs are allocated by scanning the local max sequence and adding 1. Same-checkout races are already handled (id lockfile + exclusive file creation + retry), but two clones or worktrees allocate the same ID independently, and because filenames include the title slug, git merges both files silently. Today `doctor` reports `duplicate-record-id` and mutations fail with `CARD_ID_AMBIGUOUS`, but nothing heals the workspace.

## Design

- `workfile card renumber <id|file> [--to ID]`: reassigns a card to the next free sequence — rename the file, rewrite frontmatter `id`, and rewrite every reference across all records using the existing link graph (frontmatter `parent`/`depends`/`related` lists and `[[T-NNNN]]` body mentions).
- Deterministic loser selection when healing a duplicate pair: the younger `created` moves; tie-break by fewer incoming references, then path.
- `doctor --fix` (or an explicit fix subcommand) applies the healing for every `duplicate-record-id` issue.
- Prevention across clones without central coordination is impossible by design; detection + healing keeps sequential human-readable IDs, which stay the default.
