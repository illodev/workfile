---
id: T-0184
title: A forced transition leaves no trace that it was forced
status: review
type: bug
priority: high
area: core
parent: T-0183
tags: [protocol, acceptance]
effort: S
created: 2026-08-05
updated: 2026-08-05
scope: [packages/workfile/src/modules/cards]
---

`transitionCard` appends one milestone per move and its text is
`${current.status} → ${wanted}` (`packages/workfile/src/modules/cards/mutations.ts:622`).
`force` is a parameter of the call and reaches `assertAcceptanceMet`
(`mutations.ts:613`), where it skips the acceptance gate entirely — and then
disappears. The record cannot distinguish a card that proved its criteria from
one that walked past them.

That makes the trail unusable as evidence for anything downstream: a per-actor
or per-model closure statistic reads forced closures as clean ones, and a
reviewer auditing a release has no way to list what was waved through.

This is the smallest card in T-0183 and the one worth doing first. It needs no
new frontmatter and no runner — only that the entry says what happened, and that
a forced skip carries the reason the caller already has to supply for
`claim --force`.

## Acceptance criteria

- [x] A transition that passes `force` writes a trail entry that says so.
- [x] The entry carries the reason when one was given, and `card transition --force` asks for one.
- [x] The four doors — `transition`, `patch`, `release --status done`, HTTP/MCP — all produce it, proven by a test per door.
- [x] An unforced transition's entry is unchanged, byte for byte.

## Notes

- 2026-08-05 17:16Z illodev@local#2cddaf94 — Data point from forcing one, on T-0162 (2026-08-05): the trail line reads 'review → done' and says nothing about the force, exactly as this card describes. But the state is not entirely silent — 'doctor' reports done-unchecked as a standing warning naming the criterion, for as long as the card stays done with it unproven. So the gap is narrower than 'no trace': what is missing is the trace at the moment of the decision, in the append-only record a reader reconstructs history from. The doctor answers 'is this true now', which is a different question and disappears the moment somebody ticks the box. Noted from outside the card and without claiming it.
- 2026-08-05 18:07Z illodev@local#bf4c5f67 — Implemented on feat/t-0184-forced-transitions-leave-a-trace. The gate now returns what force waived instead of returning early, so the trail can name it; requireForceReason demands a reason only when something was actually waived, which keeps card reap working. Two things turned up while wiring the surfaces: releaseCard never destructured the reason project_card_release has advertised as recorded since it was written, and the flat HTTP PATCH shape sent force into the field sanitizer, so CARD_FIELD_NOT_PATCHABLE was the answer to a forced patch. Both fixed here. Evidence: 332 tests pass, including a new door-by-door test and a CLI-level one in actor.test.ts; doctor 0 errors; strict ratchet held. Left in review because CI runs Windows and has not seen it.
- 2026-08-05 18:47Z illodev@local#bf4c5f67 — CI is green on PR #27 across Windows, macOS and Ubuntu on Node 22 and 24: 336 tests pass, doctor reports 0 errors and 0 warnings. That is the cross-platform evidence the card was held in review for. Its changelog fragment moved to CHG-0133 — this branch and T-0190's both minted CHG-0130 before either merged, which is now filed as T-0199.

## Activity

- 2026-08-05 17:50Z illodev@local#bf4c5f67 · claimed
- 2026-08-05 18:07Z illodev@local#bf4c5f67 · doing → review
