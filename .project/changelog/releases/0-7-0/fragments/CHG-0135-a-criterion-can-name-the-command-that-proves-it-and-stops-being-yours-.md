---
id: CHG-0135
title: A criterion can name the command that proves it, and stops being yours to check
type: added
area: core
visibility: public
cards: [T-0185]
tags: [protocol, acceptance]
created: 2026-08-05
updated: 2026-08-05
---

A card can declare how its criteria are proved:

```yaml
verify:
  - id: gate-test
    run: pnpm test acceptance
    criteria: ["sha256:ab12\u2026"]
```

A criterion named in a `criteria` list becomes machine-owned. `card ac --check`
refuses it and names the command that owns it, which is the whole point: it moves
the criterion from something an agent asserts to something a command decided. The
refusal is per criterion, so the unbound ones beside it still move.

The binding is a hash of the criterion's normalised text rather than its index.
Reordering the list leaves every binding intact; rewording a criterion breaks its
binding, which is wanted in both directions \u2014 the claim that was proved is not the
claim that now stands. Normalisation is trim and whitespace collapse, so reflow
and re-indentation survive it, and case and punctuation do not.

The block is validated when it lands: an unknown key, a duplicate entry id, a
missing command and a digest matching no criterion on the card are each refused
with their own error. `workfile card verify`, which runs the commands, is not in
this release.
