---
id: CHG-0180
title: An axis can be declared without being required
type: added
area: core
visibility: public
cards: [T-0231]
created: 2026-09-11
updated: 2026-09-11
---

cards.axes.NAME accepts { values: [...], required: false } beside the array it has always taken. A value outside the vocabulary is still an error and card list --axis still filters; what stops is the missing-axis warning on every open card without a value. The shape exists for one measured reason: on a board where review is where work rests rather than done, one required axis produced 1 485 of 2 072 doctor warnings, 71 percent, and the only lever the project had was to stop declaring the axis, which also threw away the vocabulary and the filter. An array keeps meaning required, so nothing already declared changes. schema --json reports the optional ones under cards.optionalAxes, and a misspelt key or a non-boolean required is refused by name at config load.
