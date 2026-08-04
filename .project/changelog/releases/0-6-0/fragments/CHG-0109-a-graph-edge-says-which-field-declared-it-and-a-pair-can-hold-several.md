---
id: CHG-0109
title: A graph edge says which field declared it, and a pair can hold several
type: changed
area: core
visibility: public
cards: [T-0159]
created: 2026-08-04
updated: 2026-08-04
---

Every explicit link in the reference graph used to arrive labelled
`reference`. A `parent`, a `depends`, an `origin` and a `related` were one
edge, so a reader could tell a declared relationship from an ID in a sentence
and nothing more.

Edges are now named after the field that declared them — `parent`, `depends`,
`origin`, `related`, `supersedes`, `superseded_by`, `graduated_to`,
`corrective_actions`, `cards`, `decisions`, `fragments` — alongside the
existing `source` and `markdown`. Prose splits in two: `wikilink` for
`[[T-0042]]`, which is a deliberate link, and `mention` for a bare ID in a
sentence, which is not. On this repository that turns one name covering 396
edges into eleven that say what they are.

**A pair can hold more than one relationship, and the index kept whichever it
saw first.** That was not only a missing label: of the 21 `origin` edges this
repository had just declared, 11 did not appear in the graph at all, because
each was a card that also listed the same record under `depends` or `related`
and the map was keyed by target ID. `T-0130 → T-0128` is `origin`, `related`
and `wikilink` at once; it used to be one of the three, and which one depended
on evaluation order.

Links therefore carry `relations`, the full list ordered strongest first, and
`relation` remains the strongest of them. `relations` is present **only when it
says more than `relation` does** — read it as `link.relations ?? [link.relation]`.
Carrying a one-element array on every edge cost 3,636 bytes of a 33,000-byte
search payload restating the singular, enough to breach that budget on its own.
30 of this repository's 742 edges hold more than one.

`depends` and `related` also reach the summary projection now, alongside
`parent` and `origin`. A listing carrying one of the four made the reader open
the file to find the rest, and anything drawing the graph from a summary would
have shown hierarchy and provenance while silently omitting every blocking and
loose edge.

Breaking for direct callers of `classifiedReferences`, which now returns
`Map<string, string[]>` rather than `Map<string, string>`. Consumers reading
`link.relation` are unaffected beyond seeing a more specific name.
