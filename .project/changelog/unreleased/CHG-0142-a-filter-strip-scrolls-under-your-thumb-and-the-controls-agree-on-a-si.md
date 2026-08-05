---
id: CHG-0142
title: A filter strip scrolls under your thumb, and the controls agree on a size
type: fixed
area: ui
visibility: public
cards: [T-0193, T-0194]
tags: [filters]
created: 2026-08-05
updated: 2026-08-05
---

Dragging a filter strip sideways on a touch screen only worked from the gaps
between the controls: a drag that started on a chip was swallowed by the chip.
The chips open on click rather than on press now, so a drag stays a drag and a
tap still opens the menu. Measured with real touch input: a 170px drag from the
centre of a chip moves the strip its full range and opens nothing.

The Workflow view's own filters — cards, memory, docs, changes, releases — never
got a strip at all and wrapped into stacked rows. They use the same one now, and
so does every other view: one component rather than a class list copied per view
with a small difference each time.

Controls are smaller and, more to the point, consistent. Sizes are rungs on one
ladder with the small one as the default, so an input and a button that share a
toolbar are the same height instead of being two independent guesses. The Triage
header fits a phone.
