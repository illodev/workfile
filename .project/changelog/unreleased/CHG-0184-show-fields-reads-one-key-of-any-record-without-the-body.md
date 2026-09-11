---
id: CHG-0184
title: show --fields reads one key of any record without the body
type: added
area: core
visibility: public
cards: [T-0247]
created: 2026-09-11
updated: 2026-09-11
---

A patch guarded by --expected-revision cost a show of the whole record first — on a long document, the body over the wire to read one hash. card, doc, memory and changelog show now take the --fields flag list already had: show T-0042 --json --fields id,revision answers with those keys and nothing else, and a key the record does not carry is left out rather than reported null. An unguarded patch still applies and says nothing; the docs now say that is by design, since the patch's own --json answer carries the new revision.
