---
id: T-0176
title: Normative records are exempt from relevance, and that does not scale
status: backlog
type: task
priority: low
area: core
tags: [context, memory]
related: [T-0147]
origin: [T-0172]
created: 2026-08-05
updated: 2026-08-05
---

[[T-0172]] made memory relevant to the card that asks for it, and deliberately
exempted the two normative collections: a convention is a rule and an accepted
decision is a choice nothing may silently contradict, so both bind a card whose
vocabulary they do not share. The test that argued for it is in
`agents.test.ts` — "a scoped record is filtered against a known scope, never
against an absent one" — and the source comment predates this work: *"A
decision is exactly the thing an agent must not silently contradict."*

The exemption is right and it does not scale. A workspace with fifty accepted
ADRs hands all fifty to every card, bounded only by `--limit`. Ranking decides
which survive the cap, so the order is useful, but the flood is back at a size
this repository has not reached yet and a real project will.

**Not yet a problem here.** This workspace has 12 decisions and one convention.
The bundle is capped at 20 records by default and 50 at most, so nothing is
being lost to this today — which is why it is a card and not a bug.

What would resolve it, roughly in order of appeal:

- **Supersede properly.** An ADR that a later one replaced should not be
  `accepted`. If the status discipline holds, the live set stays small on its
  own and this never bites. Cheapest, and it is a documentation and workflow
  question rather than a code one.
- **Scope decisions.** `scope` is already read and already filters when both
  sides declare it. An ADR about the search provider genuinely does not bind a
  card about the UI, and saying so costs one field.
- **Rank, then cap per collection.** Give normative records a floor rather than
  the whole budget: the most relevant decisions always survive, the rest report
  as left out like everything else.
- **A digest line.** Include every decision as one title-only line and the
  relevant ones in full. Preserves "nothing disappears" at a fraction of the
  budget.

## Acceptance criteria

- [ ] A workspace with 50 accepted decisions produces a bundle a prompt can carry
- [ ] No normative record disappears without the bundle saying so
- [ ] Whichever route is taken is recorded, since T-0172 chose the opposite tradeoff on purpose
