---
id: CHG-0037
title: Cards take a size, and their spacing stops overruling the call site
type: changed
area: ui
visibility: public
cards: [T-0063]
created: 2026-07-31
updated: 2026-07-31
---

`CardHeader` set its bottom padding through `[.border-b]:pb-6`, a two-class
selector that quietly outranks anything a caller writes: Memory's collection
heads asked for 8px and rendered 24.

Card now follows the current registry shape — a `--card-spacing` variable every
part reads its padding from, and a `size` prop that switches it. The default is
unchanged, so no existing card moved, and a caller that wants a denser card sets
the variable instead of losing an argument with the primitive.
