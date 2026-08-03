---
id: T-0146
title: Every MCP tool under-declares its own contract, and Glama scored it
status: review
type: task
priority: medium
area: mcp
tags: [mcp, tools, schema, glama]
created: 2026-08-03
updated: 2026-08-03
scope: [packages/workfile/src/modules/mcp, packages/workfile/docs/mcp.md]
---

Glama scored the 30 tools and graded the surface `C` — 3.2/5 average, lowest
2.4. The per-dimension breakdown says the deficit is not prose:

| Dimension | Mean | |
|---|---|---|
| Conciseness | 3.9 | best of the six |
| Purpose | 3.5 | fine |
| Behavior | 2.9 | two 2/5 outliers |
| Usage Guidelines | 2.4 | thin |
| Completeness | 2.2 | thin |
| Parameters | 2.2 | thin |

Conciseness being the strongest dimension matters: `project_card_create`
scores 5/5 on it with a 65-character description. Lengthening prose would
spend the one thing this surface already does well. What is missing is
declared *structure*.

## What is actually missing

- **157 input-schema properties across 30 tools carry 3 `description`s** — in
  `project_doctor`, `project_card_list` and `project_search`. Everything else
  is a bare `{ type: "string", minLength: 1 }`.
- **No property declares a `default`, and no description mentions one**, while
  the implementations have them: `project_next` falls back to
  `NEXT_DEFAULT_LIMIT`, `project_card_reopen` to `"backlog"`, the list tools to
  `limit: 50`.
- **No tool declares an `outputSchema`** — 0 of 30. A caller cannot know the
  shape of the reply until it has made the call.
- Closed sets travel as free strings. `project_card_transition` takes
  `status: { type: "string", minLength: 1 }` when `CARD_STATUSES` in
  `src/config/defaults.ts` freezes exactly eight values, and its description —
  "while enforcing claim and verification semantics" — names the constraint
  without ever stating it. That tool scores 1/5 on Completeness.

## The one that is not cosmetic

An agent calling `project_card_transition` has to guess the vocabulary. The
score is downstream of a real defect: the tool does not describe its own
contract, so the model fills the gap by inventing. Areas are the exception and
stay free-form — they come from `cards.areas` in project config, not from a
constant.

## Acceptance criteria

- [x] Every input-schema property carries a `description`
- [x] Closed vocabularies declare `enum`; project-configured ones say so in
      prose instead
- [x] Every property whose implementation has a fallback declares `default`
- [x] All 30 tools declare an `outputSchema` consistent with the
      `structuredContent` the server already returns
- [x] Preconditions read like `project_doc_move`'s: one clause, not a paragraph
- [x] Existing tool descriptions are not padded — Conciseness is not spent
- [x] `docs/mcp.md` matches the surface, tests pass and doctor is clean

## Activity

- 2026-08-03 20:31Z illodev@local#07eb5d4b · claimed
- 2026-08-03 20:45Z illodev@local#07eb5d4b · doing → review

