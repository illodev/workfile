---
id: T-0154
title: A card declares which record it came out of
status: review
type: feature
priority: medium
area: core
effort: M
created: 2026-08-04
updated: 2026-08-04
scope: [packages/workfile/src/config/defaults.ts, packages/workfile/src/types.ts, packages/workfile/src/modules/records/index.ts, packages/workfile/src/modules/cards, packages/workfile/bin/workfile.ts, packages/workfile/src/modules/mcp/tools.ts, packages/workfile/src/modules/health/doctor.ts, packages/workfile/docs/SPEC.md]
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
- 2026-08-04 20:18Z illodev@local#cfe281b4 · claimed
- 2026-08-04 20:59Z illodev@local#cfe281b4 · doing → review

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

- [x] `origin` is a reserved key accepting record ids of any kind, repeatable
- [x] It is classified as an explicit reference, never as a prose mention
- [x] `card create` and `card patch` accept it, and so do the two MCP tools
- [x] A doctor rule reports an `origin` that resolves to no record
- [x] Every prose provenance is migrated by hand, sentences kept
- [x] `agents context` surfaces both directions for the selected card
- [x] SPEC 11 documents the field and how it differs from the other four
- [x] `pnpm run check` green, doctor 0/0

## Notes

- 2026-08-04 20:23Z illodev@local#cfe281b4 — Half done, suite green at 275/275 and doctor 0/0, uncommitted.

Landed and verified end to end: origin is in CARD_RESERVED_KEYS, CARD_LIST_KEYS, CARD_PATCHABLE_FIELDS, CardRecord and CreateCardInput; recordReferences emits it for cards; createCard writes it to frontmatter; card create takes --origin as a comma-separated list. Smoke test through the built binary with --origin T-0155,ADR-0005 came back with both ids, and through buildProjectIndex both classify as 'reference', not 'mention' — which was the point, and it accepts a non-card id.

Two things the card did not anticipate. createCard assembles frontmatter from an explicit allowlist, so adding the field to the schema lists was not enough and the first smoke test came back with origin undefined while exiting 0 — the same silent-drop shape T-0052 fixed for --parent. And that is exactly what caught it: 'card create reaches every field the mutation accepts' failed until origin was wired into CREATE_FLAG_COVERAGE with an assertion. The guard works.

card patch needs no CLI change: it reads changes from --json-input only, and origin is patchable now, consistent with every other field.

Still to do: the origin parameter on project_card_create and project_card_patch; a doctor rule for an origin that resolves to no record; agents context surfacing both directions; --origin in cli.md; SPEC 11; and the 28 prose migrations, which stay manual. My own count is now 32 — T-0153, T-0157 and the three workflow cards were all authored with provenance in prose while this card was open.
- 2026-08-04 20:57Z illodev@local#cfe281b4 — The 28 was an estimate; the systematic extraction found 19. Migrated by hand with the direction checked per card. Three matched the phrasings and are not provenance: T-0074 ('Scene 2 opened T-0028' is a UI tour scene), T-0089 (cites a finding from T-0078, not its own origin) and T-0152 (names its sibling cards from the same documentation audit). Two more, T-0108 and T-0109, carry 'Found on the way: [[X]]' — the same edge written from the source end, already covered from the card that came out of them. Measured after: 21 origin edges, cards with no explicit card edge down from 78 to 70. And 11 of the 21 do not appear in the graph at all, because the card already had depends or related to the same id and classifiedReferences keys by target id, so the origin merges into the existing edge. That measurement is on T-0159, which it blocks.
