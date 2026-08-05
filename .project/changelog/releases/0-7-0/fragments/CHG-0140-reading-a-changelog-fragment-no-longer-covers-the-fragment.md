---
id: CHG-0140
title: Reading a changelog fragment no longer covers the fragment
type: fixed
area: ui
visibility: public
cards: [T-0197]
tags: [navigation]
created: 2026-08-05
updated: 2026-08-05
---

History is a two-column view: fragments on the left, a reader on the right.
Clicking a fragment rendered it in the reader **and** opened the shared drawer on
top of the reader with the same fragment in it, so the text appeared twice and
the copy underneath was cut off mid-word by the copy on top.

The drawer now stands down for history the way it already did for docs. A card
linked from inside a fragment still opens in the drawer, because the history pane
cannot render one.

The rule behind that map is now something a reviewer can check rather than argue:
a view owns the drawer when it already renders the selection. Open the view,
select a record, and see whether it appears without the drawer.
