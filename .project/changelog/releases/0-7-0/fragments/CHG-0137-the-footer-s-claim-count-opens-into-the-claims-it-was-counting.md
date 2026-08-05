---
id: CHG-0137
title: The footer's claim count opens into the claims it was counting
type: added
area: ui
visibility: public
cards: [T-0196]
tags: [claims]
created: 2026-08-05
updated: 2026-08-05
---

The footer reported that claims existed. Answering the useful questions — which
cards, which actor, which scopes, how stale — meant changing view.

It is now a control. Both triggers, the wide strip and the narrow badge, open one
popover listing every active claim with its card, actor, scope, state and age,
and each row opens that card. A stale claim is coloured differently from one
somebody is holding, so the list can be read at a glance rather than word by word.

Overlapping scopes are named rather than counted: the popover says which claims
collide and on which paths, because an overlap is the one claim state that needs
acting on rather than noting. The lease that decides what counts as stale stays
where it was, on the server, so the rule has one home.

The most urgent claim leads the list, and the overview's verdict now names the
same one — two surfaces disagreeing about the same claims is worse than one.
