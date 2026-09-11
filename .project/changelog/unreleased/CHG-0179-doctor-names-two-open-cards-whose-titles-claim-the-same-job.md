---
id: CHG-0179
title: doctor names two open cards whose titles claim the same job
type: added
area: core
visibility: public
cards: [T-0238]
created: 2026-09-11
updated: 2026-09-11
---

duplicate-id saw two files with one ID; nothing saw two IDs with one title, and this repository carried a frontmatter-only stub with another card's exact title that only reading found. doctor now warns duplicate-title when two open cards share their content words — lower-cased, accents and punctuation stripped, articles and prepositions dropped — with at most one word extra on one side, reported once on the later card naming the earlier. The distance was measured before it shipped: on a 2 550-card board with 1 510 open, exact titles found 0 pairs and this found 5, every one a real duplicate filed a day apart under two parents. Closed cards are out on both sides.
