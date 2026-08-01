---
id: T-0085
title: "Two concurrent claims both succeed: the guard reads pre-lock state"
status: review
type: bug
priority: high
area: core
created: 2026-08-01
updated: 2026-08-01
scope: [packages/workfile/src/modules/cards/mutations.ts, packages/workfile/test]
---
`mutateCard` takes an optional `snapshot` so a bulk edit does not re-read the
whole card directory once per card. That listing is read **before** the lock —
and the guards were reading the version of the card it remembered, not the file
they were about to overwrite.

So the check `claimCard` performs, "is this card already claimed by someone
else", answered from before the other writer claimed it. Both writers passed.
Both wrote. The loser held a card the file no longer said was theirs, and
nothing anywhere said so.

Measured on this checkout, `Promise.allSettled` over two `claimCard` calls:

| build | both succeeded | exactly one |
|---|---|---|
| `main` at `fdf68ed` | 12 of 12 | 0 |
| with the fix | 0 of 12 | 12 of 12, loser gets `CARD_ALREADY_CLAIMED` |

Introduced by `acff223` (T-0081), which added `snapshot: loaded` at four call
sites to stop mutations reading the corpus twice. The optimisation is right and
stays; what was wrong is that it also became the source of truth for the card's
own state.

`expectedRevision` closes the same race, but only for a caller that holds a
revision — and neither the CLI nor the MCP tools pass one.

## The fix

The file is already re-read under the lock for the revision check. Parse *that*
into the record every guard and every validation sees. The listing keeps its
one job: resolving the id and validating cross-card constraints.

Same treatment for the three siblings that read pre-lock state to decide
something:

- `releaseCard` derived "keep the status it already has" from the listing, so
  `changes` may now be a function of the locked record.
- `archiveCard` checked "is it terminal" pre-lock; that check is now also a
  guard under the lock. The pre-lock one stays as a cheap refusal.
- `transitionCard`'s trail line named the origin status from the listing.

The T-0081 win is intact: `budgets.test.ts` "a mutation reads the corpus once,
not twice" still passes.

## Acceptance criteria

- [x] Two concurrent `claimCard` calls yield exactly one winner, and the file agrees with it
- [x] The loser gets `CARD_ALREADY_CLAIMED`, not a silent success
- [x] A regression test races the mutators instead of calling them in sequence
- [x] The test fails on the code as it was before the fix
- [x] `archiveCard` refuses a card that stopped being terminal under the lock
- [x] `releaseCard` reads the status it preserves from disk
- [x] The corpus is still read once per mutation, not twice

## Activity

- 2026-08-01 19:06Z illodev@local#e55eab30 · doing → review
