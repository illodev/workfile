---
id: T-0060
title: "area conflates delivery layer and domain: evaluate a separate bc field"
status: next
type: idea
priority: low
area: core
source: .project/docs/research/DOC-0001-fube-session-feedback-verified-triage.md
tags: [fube-feedback, schema]
scope: [.project/cards]
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

## Activity

- 2026-07-31 22:45Z session-fube-triage · claimed
- 2026-07-31 22:45Z session-fube-triage · released

## Findings

- 2026-07-31 22:45Z session-fube-triage — Evaluated against the running code. The second axis already exists — it is `tags` — and the gap is not a missing field but three capabilities missing from a field the schema already has.

What tags already do. `tag:` is a first-class qualifier in all three query surfaces: the CLI and MCP search share one grammar, and the Explorer has its own client-side copy at ui/src/query.ts:126. Against this repository `workfile search tag:ui-polish` returns exactly the seven tagged cards. So a project with fifteen bounded contexts can already tag them and query by them today, on both surfaces, with no schema change.

What tags do not do, measured:

1. They are not validated. `card create --area treasury` on a default workspace fails with `CARD_ENUM_INVALID: Invalid area: treasury / valid values: general`. The same card created with `tags: ["tresury", "billing"]` is accepted, and `doctor` then reports 0 errors and 0 warnings. That is the card's own argument against tags, confirmed: a typo'd context is invisible where a bad area fails loudly.
2. They are not faceted. The Explorer rail lists status, priority, area and type with counts; there is no tag group. `countBy` at Explorer.tsx:86 reads a scalar `keyof Task`, so an array-valued facet needs a second counter — small, but it is the reason the rail stops where it does.
3. They are not groupable. Timeline groups by `epic` or `area` only (Boards.tsx:739). The reporter's stated payoff was reading the board by domain, and that is the one surface that would deliver it.

## Recommendation

Do not add `bc`, and do not add `cards.axes`. Add `cards.tags` to the config as an optional declared vocabulary, and close the three gaps above against tags.

The third open question decides it, as the body predicted, and it decides against a new field. A declared tag vocabulary is additive to the *config*, not to the record contract: no key is added to a card's front matter, so nothing about schema v2 becomes hard to withdraw. When `cards.tags` is absent, tags stay free-form and every existing workspace is unaffected. When a project declares it, an unknown tag fails exactly the way an unknown area does, which is the only property tags were missing that mattered. `area` keeps meaning the delivery layer, and the domain axis becomes as loud, as browsable and as groupable as the layer axis — without Workfile learning the word 'bounded context'.

Left for the maintainer: this is a feature against a published surface, so the direction is a call to make before the work is filed. `area` is read in 16 core files and 30 across the app; the recommended path touches none of them, which is most of the argument for it.
