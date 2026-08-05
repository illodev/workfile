---
id: T-0199
title: Only cards heal a duplicate id, and every branch adds a changelog fragment
status: review
type: bug
priority: high
area: core
tags: [protocol, merge]
effort: M
scope: [packages/workfile/src/modules/health]
related: [T-0019]
origin: [T-0184]
created: 2026-08-05
updated: 2026-08-05
---

Two branches both allocated `CHG-0130`. Both merged. `doctor` fails the build
with `duplicate-record-id`, and the repair it points at cannot perform it:

```text
CHG-0130 is used by multiple project records. Run `workfile doctor --fix` or
`workfile card renumber --duplicates` to heal card collisions.
```

`healDuplicateCardIds` (`packages/workfile/src/modules/health/renumber.ts:229`)
skips any duplicate whose paths are not all under the cards root, recording
`reason: "not-cards"`. The message names two commands and, for a changelog, docs
or memory collision, neither of them does anything.

The manual repair is to delete the file and re-add it through `changelog add`,
which allocates the next free id. That is what `renumberCard` does for a card —
create at the new id, remove the old path — minus the two things that make it
safe: by hand nothing rewrites references, and nothing chooses the loser
deterministically, so two clones repairing the same collision keep different
survivors and collide again on the next merge.

Changelog fragments are the most exposed record kind in the workspace. A card is
created once, by whoever picks up the work. A fragment is created by *every*
branch that changes anything user-visible, and the id is allocated by scanning
the local maximum — so two parallel branches collide by construction rather than
by accident. This one broke CI on PR #27.

Memory records and docs allocate the same way, at lower frequency.

## What the fix has to decide

The comment at `renumber.ts:212` gives the reason the sweep stops at cards:
docs derive ids from paths and memory collections have their own conventions,
"this routine has no business rewriting". That is an argument for a per-module
renumber, not for none — the changelog derives its filename from id and title
slug exactly as cards do.

A released fragment is frozen (LRN-0016), so the survivor cannot be picked by
`created` alone the way cards are: released beats unreleased, and renumbering
something already cut into a release would rewrite shipped history.

## Acceptance criteria

- [x] A duplicate changelog id heals through the CLI, with no file deleted by hand.
- [x] The survivor is chosen deterministically, so two clones repairing the same collision converge on the same result.
- [x] A released fragment never moves; the unreleased side of the collision does.
- [x] References to the moved id inside the protocol root are rewritten, or reported when the collision makes them ambiguous.
- [x] Doctor names a command that can repair the collision it just reported, for every record kind it reports one on.
- [x] Memory and docs collisions are either healed the same way or refused with the reason they are not.
- [x] A test covers a changelog collision end to end: two fragments carrying one id in, a clean doctor out.

## Notes

- 2026-08-05 20:31Z illodev@local#bf4c5f67 — Verified: 10 tests in test/duplicates.test.ts plus a CLI test that heals the real shape through the real binary — two CHG fragments carrying one id in, doctor exits 1 and reports it, doctor --fix moves the newer one, and a second doctor run exits clean. That last part is the point: the bug was never in the library alone, it was that doctor printed a remedy the CLI could not perform. Docs and memory heal too, and five cases are refused with their own sentence and no command named. SPEC 18.3 now carries the repair contract, which the agent flagged as owed and outside its paths.

## Activity

- 2026-08-05 20:31Z illodev@local#bf4c5f67 · backlog → review
