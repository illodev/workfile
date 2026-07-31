---
id: CHG-0034
title: "doctor learns a baseline: --new gates on what you just broke"
type: added
area: core
visibility: public
cards: [T-0058]
created: 2026-07-31
updated: 2026-07-31
---

`doctor` reported absolute state, which stops being useful the moment a
repository carries inherited debt: a clean run and an unchanged dirty one look
alike, so nobody can require it before finishing. An agent working a repository
with 640 preexisting broken-link warnings coped by writing the counts down at
session start and diffing by hand.

`doctor --accept-baseline` records the current issue set; `doctor --new` then
reports only what appeared afterwards and exits 1 on anything new, 0 otherwise.
Issues are matched on rule, subject and message, so two different problems from
one rule against one card stay distinct and clearing an old one cannot mask a
new one. Resolved issues are counted, not listed, with a nudge to re-accept.

The baseline lives at `.project/doctor-baseline.json` and is committed. Under
the cache it would be per-clone and absent in CI, which is the one place a
"nothing new" verdict has to hold; in the tree, newly accepted debt shows up in
the diff where a reviewer can see it.
