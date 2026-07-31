---
id: CHG-0039
title: Reading views get a measure, and the memory panel stops shouting
type: changed
area: ui
visibility: public
cards: [T-0065]
created: 2026-07-31
updated: 2026-07-31
---

Triage pinned its card to the left edge of a very wide column and Docs let the
document body run the whole width of the reading pane. Both now share one
measure — 72 characters, centred — so a wide display gives you a readable column
instead of a longer line.

Memory's record body was a different problem: the shared typeset inherits the
16px document root while the app draws its own text at 14 and below, so the body
rendered larger than the panel around it. It now sets its own size, which is
what the typeset variable is for.
