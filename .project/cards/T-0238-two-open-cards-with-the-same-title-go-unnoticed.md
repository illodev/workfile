---
id: T-0238
title: Two open cards with the same title go unnoticed
status: backlog
type: idea
priority: low
area: core
source: .project/cards/T-0237-the-protocol-never-says-what-to-do-when-a-turn-end.md
raised: derived
created: 2026-09-03
updated: 2026-09-03
---

`duplicates.ts` classifies duplicate record **ids**. Nothing looks at titles, so two open cards claiming the same thing sit on the board and the reader has to notice.

This repository had one: **T-0230 and T-0231 carried an identical title**, and T-0230 was a 202-byte stub — frontmatter only, uncommitted, a strict subset of its twin. An aborted `card create`, linked from nowhere. It was found by reading, not by a tool.

## The measurement, which is the reason this is `low` and not `medium`

Normalised exact-title match over every **open** card of a 2 373-card board (the consuming repository, 2026-09-03):

    0 groups

So the rule would have been silent on the largest board available and would have caught exactly one thing: an aborted create in this repository's own workspace. That is a good ratio for a rule — it only speaks when something is wrong — but it is a thin case to spend code on, and worth saying out loud rather than discovering after writing it.

**And it would not catch the shape that actually hurts.** The watermark problem measured the same day produced *seven* open cards for one job, and their titles all differed — `227 → 218 → 209 → 203 → 198 → 191`. Exact matching sees none of them. Catching those needs the protocol rule that now exists (a batch that advances updates its own card), not a matcher.

## Acceptance criteria

- [ ] `doctor` reports open cards that share a normalised title, naming both ids.
- [ ] The rule is measured against a real board before it ships, and the measurement is recorded here, so it is not adopted on the strength of a single anecdote.
- [ ] Near-matching is decided rather than assumed: exact-normalised only, or a stated distance with its false-positive rate on the same board.
