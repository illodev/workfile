---
id: CHG-0036
title: Status colour leaves the border, and the corners come back
type: changed
area: ui
visibility: public
cards: [T-0062]
created: 2026-07-31
updated: 2026-07-31
---

The Overview and Health tiles carried their colour as a left border and the
board columns as a top border, and a border follows the corner radius — so the
accent bent away into the rounding. The columns had squared their top corners to
hide it, which left them rounded at one end only.

The accent is an inset bar now: square ends, stopped short of the corners, one
`Accent` component for all three so the treatment cannot drift apart again. The
board columns are rounded on all four corners.
