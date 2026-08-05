---
id: CHG-0136
title: The filter every view had behind it now has a control in front of it
type: added
area: ui
visibility: public
cards: [T-0195]
tags: [filters]
created: 2026-08-05
updated: 2026-08-05
---

The work views have carried a free-text filter for as long as the address bar has
carried `?q=` — with a token grammar, a `field:value` form and a `/pattern/flags`
regex behind it — and nothing was ever bound to it. The strongest filter in the
application could only be reached by typing a URL, while the empty state told
readers to "clear the search". It now has a field, next to the filter chips.

Memory, history and docs had three hand-rolled boxes of three different heights
promising three different things. They are one control now, and the term survives
a reload and follows you from one collection to the next as `?find=`.

What a search matches is stated once per corpus and is true of each: the record
collections search title and body, matching the body by whole word; the card
views search id, title and tags, because reaching into prose on every keystroke
was measured and rejected.
