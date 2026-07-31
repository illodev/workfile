---
id: CHG-0038
title: The record counter no longer spins a loader that never finishes
type: fixed
area: ui
visibility: public
cards: [T-0064]
created: 2026-07-31
updated: 2026-07-31
---

The activity footer put a spinner next to "index N records". Nothing was
loading: the number is a sum of counts already in hand, so the spinner turned
for the life of the tab, in every workspace.

It is a static mark now. A spinner that never stops costs more than it shows —
it teaches you to ignore the one control that means the app is busy.
