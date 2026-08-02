---
id: CHG-0086
title: Declared axes survive the listings agents read
type: fixed
area: core
visibility: public
created: 2026-08-02
updated: 2026-08-02
---
A project that declares a second classification axis could not see it in the
listing an agent reads. `project_card_list` and `project_search` project
records through a view that keeps a fixed list of field names, and a
per-project key can never be on a fixed list — so the surface the axis exists
for was the one surface that dropped it:

```
CLI  card list --json      context = "treasury"
CLI  card show --json      context = "treasury"
MCP  project_card_list     context = undefined
```

An agent asking what is in `doing` got cards with the domain stripped off, and
nothing said so.

Records now carry the names of the axes they actually have, stamped where a
card becomes a record and the project's declarations are already in hand, and
the projection keeps whatever they name. Listings gained an `axes` field
alongside, so a reader can find a project's axes without being told its
vocabulary in advance.

Cards with no value for an axis carry neither the key nor the name, rather than
an empty string.
