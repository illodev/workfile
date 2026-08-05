---
id: CHG-0144
title: Every filter bar is shaped the same, and the controls in it agree on a corner
type: fixed
area: ui
visibility: public
cards: [T-0211, T-0212]
tags: [filters]
created: 2026-08-05
updated: 2026-08-05
---

The work views put the view title and the search field on one line, which left
the most capable filter in the application as a short box crushed against the
heading while the chips were pushed off to the right. Memory did it the other
way — title, rule, field across the full width, chips below — and that is now
every view's shape.

The chips were also pills sitting beside a field that is not one. They no longer
declare a radius at all: they take the button's own, which is the value the field
already used.
