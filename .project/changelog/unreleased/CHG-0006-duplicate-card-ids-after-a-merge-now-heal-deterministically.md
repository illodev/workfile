---
id: CHG-0006
title: Duplicate card IDs after a merge now heal deterministically
type: added
area: core
visibility: public
cards: [T-0019]
created: 2026-07-30
updated: 2026-07-30
---

Two clones allocate the same sequential card ID independently, and because filenames carry the title slug git merges both files without a conflict. `workfile card renumber` (and `doctor --fix`) now heals the workspace: the older card keeps the ID, the younger moves to the next free one, references inside .project are rewritten when unambiguous and reported for review when a collision makes them ambiguous by construction.
