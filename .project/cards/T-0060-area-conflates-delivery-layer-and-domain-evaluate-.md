---
id: T-0060
title: "area conflates delivery layer and domain: evaluate a separate bc field"
status: backlog
type: idea
priority: low
area: core
source: .project/docs/research/DOC-0001-fube-session-feedback-verified-triage.md
tags: [fube-feedback, schema]
scope: [packages/workfile/src/modules/cards, packages/workfile/src/config]
created: 2026-07-31
updated: 2026-07-31
---

Unvalidated proposal. Recording the evidence, not committing to the field.

`area` is the only classification axis a card has, and it is shaped like an
application layer. On a DDD backend with 15 bounded contexts, one `api` value
swallowed Treasury, Verifactu, Billing, IAM and Subscription. The reporting agent
filed fiscal models under `fiscal` and treasury under `api`, called the result
incoherent, and took the blame itself — but noted the enum invited it.

`cards.areas` is project-configurable, so that repository could declare its 15
contexts as areas today. It would then lose the layer axis instead, which is the
actual shape of the problem: one field is being asked to carry two orthogonal
questions, and whichever you pick, the other becomes unqueryable.

## Open questions

- Is a second axis worth a schema change, or do `tags` already cover it? Tags are
  unvalidated and unfaceted, which is the argument against — a typo'd bounded
  context is invisible where a bad `area` fails loudly.
- If a field is added, does the board group by it? The reporter's stated payoff
  was reading the board by domain, and a field nothing renders buys nothing.
- Does it generalize? "Bounded context" is DDD vocabulary. A neutral second axis
  configured per project — `cards.axes` — would serve the same need without
  importing one methodology's terms into the schema.

The last question is probably the one that decides this. Schema v2 is a published
contract, and a field added for one project's vocabulary is hard to withdraw.
