---
id: CHG-0033
title: The protocol says where durable knowledge goes
type: changed
area: docs
visibility: public
cards: [T-0059]
created: 2026-07-31
updated: 2026-07-31
---

`record-knowledge` explained how to choose between memory collections and never
what a memory record was for in the first place, versus a card note, versus a
document. All three fit "I learned this and it must not be lost", so an agent
facing the choice under load used whichever record was already open — card notes,
eighteen times — and left twenty-one memory records untouched.

The workflow now picks the record before the collection: a card note is evidence
that dies with its card, memory outlives the card and changes future work, a doc
is read start to finish. When two fit, prefer memory.
