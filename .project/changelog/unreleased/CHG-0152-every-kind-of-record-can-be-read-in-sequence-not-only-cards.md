---
id: CHG-0152
title: Every kind of record can be read in sequence, not only cards
type: added
area: ui
visibility: public
cards: [T-0207]
created: 2026-08-07
updated: 2026-08-07
---

The previous/next cursor the card inspector has always carried is now one shared control, rendered by every panel that reads a record: memory, changelog fragments and releases, and the readers Docs and History own themselves. It walks the list the view was showing, in the order it was showing it, so it narrows when the filters do — and it is absent, rather than arbitrary, where there is no list behind the record: a link inside a body, a related row, the command palette, or a node of the workflow graph.
