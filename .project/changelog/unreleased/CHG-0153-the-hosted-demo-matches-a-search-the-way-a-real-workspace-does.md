---
id: CHG-0153
title: The hosted demo matches a search the way a real workspace does
type: fixed
area: search
visibility: public
cards: [T-0202]
created: 2026-08-07
updated: 2026-08-07
---

The demo backend answered a query with a substring scan over the raw title, body, path and id, and its command palette had a third rule again — id and title only. The server tokenizes: a body matches by whole word, only a title falls back to a substring, and metadata and identity count too. So a partial word found a body in the demo and nothing against a real workspace, and the palette could not find a record by a word in its body at all. Both now run the same rule, filters and negation included, and a parity test drives the two implementations over one fixture.
