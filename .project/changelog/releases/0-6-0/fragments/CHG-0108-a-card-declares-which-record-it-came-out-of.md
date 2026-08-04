---
id: CHG-0108
title: A card declares which record it came out of
type: added
area: core
visibility: public
cards: [T-0154]
created: 2026-08-04
updated: 2026-08-04
---

Cards carry a fifth relationship field, `origin`: the records this work was
discovered while doing. It holds record IDs of any kind, because decisions and
learnings spawn work as often as cards do, and it is a list, because one sitting
can produce several.

None of the four existing fields said it. `parent` means the card is *part of*
another; `depends` means one blocks the other, and an origin is usually already
closed; `related` loses both the direction and the reason; `source` is a
repository path checked on disk and cannot hold an ID at all. So the
relationship was being written in prose — on this repository, in six different
spellings, from `Split out of T-0047` to `Found while auditing the locks for
[[T-0140]]`.

It is available as `card create --origin ID,ID`, as an `origin` parameter on
`project_card_create`, and through `card patch --json-input` and
`project_card_patch` like every other field. In the reference graph it is an
explicit `reference`, never a prose `mention`.

`agents context --card ID` reports it in both directions — **Came out of** for
the card's own field, **Spawned** for every card naming this one — and returns
the same as structured `provenance`. Only one of those two is readable off the
card; the other has to be found by scanning, which is why a card could
previously say where it came from but never what it produced.

`doctor` reports an `origin` that resolves to no record as `missing-origin`, and
a card naming itself as `self-origin`. The first is a warning rather than an
error on purpose: nothing computes on `origin`, so a dangling one costs a
missing edge rather than a wrong ranking, and the pre-commit gate runs at error
severity — a backfill in progress should not block a commit. It resolves
against every record kind, not just cards.

The nineteen provenances this repository had written in prose were migrated by
hand, sentences kept. Three sentences that matched the same phrasings were
checked and left alone: one was a UI tour scene that `opened` a card, one cited
a finding from earlier work rather than its own origin, and one named its
sibling cards from a shared audit. Two more were the same edge written from the
other end, already migrated from the card that came out of them.
