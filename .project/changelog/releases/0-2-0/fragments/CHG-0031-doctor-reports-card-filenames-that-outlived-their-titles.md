---
id: CHG-0031
title: doctor reports card filenames that outlived their titles
type: added
area: core
visibility: public
cards: [T-0054]
created: 2026-07-31
updated: 2026-07-31
---

Creating a card derives its filename from the title. Retitling it never revisited
that, so a file could sit for months named after work it no longer described —
and nothing reported it. The filename is the handle people and agents grep by,
so a stale one misdirects long after anyone remembers the rename.

The new `filename-stale` rule names the drift and the filename it would repair
to. It is a warning, not an error: the record is intact and only its label has
moved. `doctor --fix` performs the rename, which is deliberately opt-in —
renaming on every title edit would churn history and break editor buffers open
mid-session.
