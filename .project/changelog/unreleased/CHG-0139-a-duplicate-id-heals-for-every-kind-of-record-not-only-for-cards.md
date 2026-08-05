---
id: CHG-0139
title: A duplicate id heals for every kind of record, not only for cards
type: fixed
area: core
visibility: public
cards: [T-0199]
tags: [merge]
created: 2026-08-05
updated: 2026-08-05
---

Sequential ids are allocated by scanning the local maximum, so two branches mint
the same one independently and the filenames carry different title slugs — git
merges both files without a conflict and the collision surfaces in the doctor. It
happened here: two branches both created `CHG-0130`, and the build went red on a
repair the tool could not perform.

`doctor --fix` and `card renumber --duplicates` healed cards only. Everything
else got an error naming two commands that would skip it. Changelog fragments,
managed documents and memory records now heal the same way: the losing record
moves to a free id in its own sequence and the surviving one keeps every
reference already written to it.

The survivor is chosen the same way in every clone, so two people repairing the
same collision converge instead of colliding again. A released fragment never
moves — it was frozen when its release was cut.

Five cases are refused rather than healed, each saying why and naming no command:
an indexed file outside the managed root, a release record, two released
fragments, one id spanning two kinds, and records carrying no id at all.
