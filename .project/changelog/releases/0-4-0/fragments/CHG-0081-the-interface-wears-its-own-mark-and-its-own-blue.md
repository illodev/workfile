---
id: CHG-0081
title: The interface wears its own mark and its own blue
type: changed
area: ui
visibility: public
cards: [T-0122, T-0123]
decisions: [ADR-0009]
created: 2026-08-02
updated: 2026-08-02
---

The sidebar drew a blank square where a logo belongs; it now carries the Workfile mark — the same drawing the favicon and the landing use.

The primary action colour is the brand blue again in both themes, matching the landing rather than sitting at zinc's near-black. The shadcn migration listed this as an accepted loss and ADR-0009 records taking it back: one token pair leaves the published scale, and the status, priority and severity colours are untouched.
