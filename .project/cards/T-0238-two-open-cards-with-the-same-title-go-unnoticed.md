---
id: T-0238
title: Two open cards with the same title go unnoticed
status: done
type: idea
priority: low
area: core
source: .project/cards/T-0237-the-protocol-never-says-what-to-do-when-a-turn-end.md
raised: derived
created: 2026-09-03
updated: 2026-09-11
scope: [packages/workfile/src/modules/cards/cards.ts, packages/workfile/test/cards.test.ts, packages/workfile/docs/cli.md]
verified:
  at: "2026-09-11T17:09:02.441Z"
  method: manual
  commit: 44b3a5d251865ba1e8737951bd341eded50255f3
  digest: "sha256:0aa076e8fa781c690fe4f954f9d076044f7415fcd881d8f987cf4555a72ee7e2"
---

`duplicates.ts` classifies duplicate record **ids**. Nothing looks at titles, so two open cards claiming the same thing sit on the board and the reader has to notice.

This repository had one: **T-0230 and T-0231 carried an identical title**, and T-0230 was a 202-byte stub — frontmatter only, uncommitted, a strict subset of its twin. An aborted `card create`, linked from nowhere. It was found by reading, not by a tool.

## The measurement, which is the reason this is `low` and not `medium`

Normalised exact-title match over every **open** card of a 2 373-card board (the consuming repository, 2026-09-03):

    0 groups

So the rule would have been silent on the largest board available and would have caught exactly one thing: an aborted create in this repository's own workspace. That is a good ratio for a rule — it only speaks when something is wrong — but it is a thin case to spend code on, and worth saying out loud rather than discovering after writing it.

**And it would not catch the shape that actually hurts.** The watermark problem measured the same day produced *seven* open cards for one job, and their titles all differed — `227 → 218 → 209 → 203 → 198 → 191`. Exact matching sees none of them. Catching those needs the protocol rule that now exists (a batch that advances updates its own card), not a matcher.

## Measured again on 2026-09-11, and the distance decided

Same board, 2 550 cards, 1 510 open, read raw from the frontmatter:

- exact normalised title (lower-case, accents and punctuation stripped, whitespace collapsed): **0 groups**, confirming the 2026-09-03 number
- token-set overlap ≥ 0.8 over content words (stopwords in Spanish and English dropped, at least two words): **5 pairs**, every one read and every one a real duplicate — the same feature filed 2026-07-24 and 2026-07-25 under two different parents, once with accents and once without: T-0676/T-0534, T-0134/T-1170, T-0614/T-0527, T-0174/T-0449, T-0586/T-0130
- one open card repeating a **closed** card's title (T-0130 ↔ T-0373 `discarded`), which is a reopen rather than a duplicate and is not reported
- on this repository, 15 open cards: 0 by either rule — the T-0230 stub that prompted the card was deleted before it shipped

So the rule is the overlap, not exact matching: exact matching would have been silent on the largest board available, and the overlap adopted has a measured false-positive rate of 0 in 5 with nothing looser measured. `doctor` as shipped, run against that board through `--root`, reports the same five pairs the measurement found, each once on the later card. Overlap 0.8 in practice means the same content words with at most one extra word on one side: two-word titles must match exactly, four-word titles may differ by one.

## Acceptance criteria

- [x] `doctor` reports open cards that share a normalised title, naming both ids.
- [x] The rule is measured against a real board before it ships, and the measurement is recorded here, so it is not adopted on the strength of a single anecdote.
- [x] Near-matching is decided rather than assumed: exact-normalised only, or a stated distance with its false-positive rate on the same board.

## Activity

- 2026-09-11 16:34Z illodev@local#597ecdc9 · claimed
- 2026-09-11 16:38Z illodev@local#597ecdc9 · released
- 2026-09-11 17:09Z illodev@local#597ecdc9 · review → done

## Notes

- 2026-09-11 16:37Z illodev@local#597ecdc9 — Shipped as duplicate-title in diagnoseCards, next to parent-all-children-closed (T-0226): both read the board sideways where every earlier rule read one card. Pinned by the cards.test.ts case 'doctor names two open cards whose titles claim the same job' — the accent/quote/article pair reported once on the later card with overlap 1; a one-extra-word pair at 0.83; three of five words shared stays silent; a done twin is out on both sides. Run through doctor --root against the Fube board the same day: the five pairs the measurement found, each once, overlaps 1, 1, 0.88, 0.88, 0.83. Criterion 3 is decided as the overlap rule with the rate recorded in the body; exact matching is what the card originally proposed and it is what the measurement ruled out.
- 2026-09-11 17:09Z illodev@local#597ecdc9 — manual verification: @illodev/workfile@0.12.0 installed from npm into a clean consumer on 2026-09-11 (release run 34625743832: npm publish, MCP Registry io.github.illodev/workfile 0.12.0 active, GitHub Release v0.12.0). Two open cards titled 'Añadir acción de domiciliar en el menú de la factura' and 'Anadir accion "Domiciliar factura" al menu de la factura' produce one duplicate-title warning, on the later card naming the earlier, overlap 1. Same day, against the Fube board: the 5 measured pairs, once each.
