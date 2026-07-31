---
id: CHG-0041
title: The Overview and the Explorer follow the rest of the app onto a phone
type: fixed
area: ui
visibility: public
cards: [T-0068]
created: 2026-07-31
updated: 2026-07-31
---

The two views left out of the narrow-screen pass now behave like the rest.

The Overview's backlog rows gave the title whatever the trailing meta strip did
not want, and the strip could not shrink, so on a phone "never claimed" was cut
mid-word. The title now takes the row and the strip drops to a second line under
it. The trail's five columns are fixed at 460px against 350px of usable width;
below `sm` they re-cut into two lines — when, then who and what — so the
sentence, which is the only column carrying meaning, stops being the one that
falls off the screen.

The Explorer keeps its table. Its 204px facet rail moves behind a sheet below
1024 and the grid scrolls sideways for the columns that do not fit, rather than
becoming a card list: sorting, selection, inline editing and the row windowing
all measure one grid, and a second implementation of them would be a second set
of bugs. The rail returns pinned at 1024, unchanged.
