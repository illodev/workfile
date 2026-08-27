---
id: CHG-0161
title: "A re-wrapped scope: no longer makes a card unclaimable"
type: fixed
area: core
visibility: public
created: 2026-08-27
updated: 2026-08-27
cards: [T-0225]
---

A formatter reformats the YAML header along with the Markdown around it, and a flow
sequence wider than its print width comes back spread over lines:

```yaml
scope:
  [
    apps/api/src/FubeCore/Domain/Billing/TaxModel/State/Provider/Model349StateProvider.php,
  ]
```

That is the same list, written the way YAML allows. The codec read it as `opaque` and
refused to rewrite the key — and `card claim` writes `scope`, so every card a formatter
had reached failed on the first command of the protocol. On the repository where this
surfaced that was 135 of 1 811 cards, each unstartable until somebody rewrote its header
by hand.

A multi-line flow sequence now reads as the list it is, for any key declared a list, and is
written back on one line. Reproducing the way it was read would mean re-deriving the
formatter's line breaks from a print width the codec does not know; the key is one the
patch is already rewriting, so it goes back canonical and is stable from there.

Nesting inside one is still refused rather than flattened — `[[a], [b]]` and `[{id: a}]`
are lists this codec has no scalar reading of. So is a re-wrapped value under a key that
was never declared a list, because reading an array out of one would send it back through
the serializer as the scalar `a,b`.

What is still refused now says so usefully. The message names the repair for the shape in
front of the reader — put the collection on one line, or flatten a value deeper than one
level — instead of answering "nested structure" to both and sending half of them looking
for nesting that is not there.

And `doctor` reports it. A record whose header holds a key no write can touch is a warning
naming the file, the keys and the repair, on cards, docs, changelog fragments, releases and
memory alike. The record reads, lists and searches perfectly; what is broken is a write
nobody has attempted yet, which is why it is a warning and why finding it should not require
an agent to crash into it.
