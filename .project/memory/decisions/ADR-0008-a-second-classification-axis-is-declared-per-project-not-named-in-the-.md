---
id: ADR-0008
title: A second classification axis is declared per project, not named in the schema
status: accepted
related: [T-0060]
scope: [packages/workfile/src/config, packages/workfile/src/modules/cards]
created: 2026-08-02
updated: 2026-08-02
---

## Context

`area` is a card's only classification axis and it is shaped like a delivery
layer. On a DDD backend with fifteen bounded contexts, one `api` value swallowed
Treasury, Verifactu, Billing, IAM and Subscription; the reporting agent filed
fiscal models under `fiscal` and treasury under `api` and called the result
incoherent. `cards.areas` is configurable, so that repository could declare its
fifteen contexts as areas — and would then lose the layer axis instead. One
field is being asked two orthogonal questions, and whichever it answers, the
other becomes unqueryable.

## What is already true

Measured before designing anything, which changed what there is to build. A
second axis works end to end today with no schema change at all:

```
context: treasury            # added by hand to a card's frontmatter
card show  → context = "treasury"
search "context:treasury"  → [T-0001]
search "context:billing"   → []
```

`parseCard` spreads the whole frontmatter onto the record, and the query grammar
reads the record's own keys rather than a second list. Storage and retrieval
are solved. What is missing is the part the original proposal identified as the
argument against using `tags`: nothing declares the axis, so nothing validates
it. `context: tresury` is accepted and then matches nothing — the tags failure
mode with extra steps.

## Decision

Axes are declared per project under `cards.axes`, as a name mapped to its
vocabulary:

```js
cards: {
    areas: ["api", "web", "infra"],
    axes: { context: ["treasury", "verifactu", "billing", "iam"] }
}
```

Each axis is a flat frontmatter key, not a nested `axes:` mapping — the
frontmatter codec does not rewrite nested structures, and a flat key keeps the
storage greppable, which is a stated property of this format.

Neutral naming, not `bc` or `boundedContext`. "Bounded context" is one
methodology's vocabulary, schema v2 is a published contract, and a field added
for one project's language is hard to withdraw. A repository that wants that
word declares `axes: { context: [...] }` and gets it.

Rejected: `cards.tags` as a declared vocabulary. Tags are unfaceted and
unordered, the board does not group by them, and giving them a vocabulary makes
them a weaker version of the same idea while keeping the name that says
"unvalidated".

## Consequences

Write paths need a generic flag — `--axis name=value`, repeatable — because
`COMMAND_FLAGS` is static and axes are per project. Doctor needs a rule for a
value outside the declared vocabulary. The board should group by an axis, since
the reporter's stated payoff was reading it by domain and a field nothing
renders buys nothing.

An undeclared key in card frontmatter stays legal, as it is today. Declaring an
axis is what turns it from a free-text note into something that fails loudly.
