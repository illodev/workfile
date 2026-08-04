---
id: T-0154
title: A card declares which record it came out of
status: backlog
type: feature
priority: medium
area: core
effort: M
created: 2026-08-04
updated: 2026-08-04
---

Work discovered while doing other work has no field to say so, and the
repository has been writing it in prose instead.

**28 of 153 cards** already carry the relationship as text, in at least six
spellings: `Found while working T-0025`, `Split out of T-0047`, `Found on the
way: [[T-0112]]`, `Found while auditing the locks for [[T-0140]]`, `opened
T-0028`, `found three defects outside this card: T-0095`. T-0153 says
"Discovered while documenting the claude command family for T-0151" for the
same reason.

None of the four existing edges carries it:

| Field | Means | Why it does not fit |
|---|---|---|
| `parent` | decomposition | T-0153 is not part of T-0151, it came out of it |
| `depends` | blocking | nothing blocks; the origin is usually already closed |
| `related` | loose association | loses direction and reason |
| `source` | a repository-relative **path**, checked on disk by the `missing-source` rule | cannot hold a record id |

`.project/agents/workflows/discovered-work.md` tells an agent to "relate it
through `parent`, `depends`, `source` or record IDs" — and none of the four
means "discovered while doing".

## Shape

`origin`, alongside the other reserved keys, holding **record ids of any kind**
rather than card ids only. Decisions spawn work today: ADR-0005 produced T-0038
and T-0039, and four cards say `per [[LRN-0011]]`. Restricting it to cards
throws away the half that makes the tree worth reading.

A list rather than a scalar, because T-0088 spawned three cards in one sitting
and the reverse edge is what the reader wants — but a *card* names its own
origins, so the list is short and authored where the knowledge is.

## What it touches

- `CARD_RESERVED_KEYS` and `ProjectCardsConfig` types.
- `recordReferences` / `classifiedReferences`: a fifth relation, classified
  `reference` rather than `mention`, so it is never confused with prose.
- `card create --origin`, `card patch --origin`, both repeatable, and the
  matching `project_card_create` / `project_card_patch` MCP parameters.
- A doctor rule for an `origin` that resolves to no record — the existing
  `missing-source` rule is the model.
- The `## Activity` trail is not the place for this. It records what a command
  did; `origin` is a declared fact about the card.

## Migrating the 28

By hand, in this card, not by regex. The phrasings are inconsistent enough
that a script would guess wrong, and several sentences carry a *reason* worth
keeping in prose even once the edge is structured. Add the field; leave the
sentence.

## Why this lands before any interface

Measured on this workspace today: 98 explicit card-to-card edges over 153
cards, and **78 cards with no explicit card edge at all**. Half the board is
isolated. `origin` is the edge that closes that gap, and it pays without a
pixel drawn — `agents context --card` can answer what a card spawned, and
`discovered-work.md` gets a real target instead of four fields that do not fit.

## Acceptance criteria

- [ ] `origin` is a reserved key accepting record ids of any kind, repeatable
- [ ] It is classified as an explicit reference, never as a prose mention
- [ ] `card create` and `card patch` accept it, and so do the two MCP tools
- [ ] A doctor rule reports an `origin` that resolves to no record
- [ ] The 28 prose provenances are migrated by hand, sentences kept
- [ ] `agents context` surfaces both directions for the selected card
- [ ] SPEC 11 documents the field and how it differs from the other four
- [ ] `pnpm run check` green, doctor 0/0
