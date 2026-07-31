---
id: CHG-0040
title: The interface works on a narrow screen
type: fixed
area: ui
visibility: public
cards: [T-0066, T-0067]
created: 2026-07-31
updated: 2026-07-31
---

Below about 900px the header stopped working: the breadcrumb refused to yield
and drew straight over the search field, and at 390 the search button was a
40px stub. The activity footer did the same, stacking its badges on top of one
another. The breadcrumb now steps aside — it repeats the view header one line
down — and the claim ledger yields to the status badges.

Docs, History and Memory put a list and a detail pane side by side at every
width. They collapse to one pane below 1024 with a Back control, Memory keeps
its collections as a horizontal scroller, and Health's tiles and issue rows
wrap instead of running off the edge.

1024 rather than 768: the sidebar's overlay mode starts below 768, so at exactly
768 it still holds its full width and a split pane got about 260px a side.
