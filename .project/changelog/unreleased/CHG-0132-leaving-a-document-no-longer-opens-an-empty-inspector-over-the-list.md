---
id: CHG-0132
title: Leaving a document no longer opens an empty inspector over the list
type: fixed
area: ui
visibility: public
cards: [T-0192]
tags: [docs, inspector]
created: 2026-08-05
updated: 2026-08-05
---

Pressing "All documents" went back to the list and opened the inspector drawer over it, holding nothing.

The control said "no document" with an empty string, and `recordCollection("")` fell through its prefix tests to the default `memory` — so the docs view, which owns its own reader and stands the shared drawer down for `docs`, saw a memory record and let the overlay open.

Both ends are fixed: the control clears the selection outright, and an id that is not `PREFIX-DIGIT` names no collection instead of naming the fallback. The drawer's rule is now a function rather than an inline comparison that read true for an absent collection as readily as for another view's.
