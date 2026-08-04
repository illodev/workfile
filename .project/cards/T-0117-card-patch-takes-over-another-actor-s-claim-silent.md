---
id: T-0117
title: card patch takes over another actor's claim silently
status: done
type: bug
priority: high
area: core
scope: [packages/workfile/src/modules/cards/mutations.ts]
related: [T-0108]
created: 2026-08-02
updated: 2026-08-04
origin: [T-0108]
---

Found while fixing [[T-0108]], from a reviewer's observation that a change of
holder is a milestone the trail does not record. It is not only unrecorded, it
is unguarded.

Reproduced on a scratch workspace:

```
$ workfile card claim T-0001 --actor alice
$ grep claimed_by T-0001-h.md
claimed_by: alice
$ echo '{"claimed_by":"mallory"}' > h.json
$ workfile card patch T-0001 --json-input h.json
T-0001 updated
$ grep claimed_by T-0001-h.md
claimed_by: mallory
```

The trail still reads one line, `alice · claimed`. Alice is still shown as the
actor who took it; the card now belongs to someone else.

Every other route to that field defends it. `claimCard` refuses with
`CARD_ALREADY_CLAIMED` unless the claim is stale or `--force` is passed, and
forcing demands a reason it writes into the card. `transitionCard` and
`releaseCard` both refuse with `CARD_CLAIM_OWNER_MISMATCH`. `patchCard` treats
`claimed_by` as an ordinary field and writes it.

This is the failure this module has now had three times: a rule enforced at
some of the entrances. `assertAcceptanceMet` was the first, the activity trail
was the second, and the claim guard is the third — and this one matters most,
because claims are the whole mechanism by which two agents in one checkout stay
out of each other's way. A guard that any agent can walk around by writing the
field directly is not a guard. There is already a session in this repository's
history where two agents shared a checkout and one broke the other's work.

Worth deciding together with the fix: whether a change of holder should write a
trail line at all. It is a protocol milestone by the trail's own vocabulary —
`claimed` and `released` are both lines — and today the only one that leaves no
record.

## Acceptance criteria

- [x] Patching `claimed_by` or `claimed_at` is refused for a card another actor
      holds, on the same terms `claimCard` refuses it
- [x] Taking a claim over deliberately still works, and still records why
- [x] The guard is shared with the other three writers rather than restated
- [x] A change of holder leaves a trail line, or the decision not to is recorded

## Activity

- 2026-08-02 17:21Z illodev@local#aed59c5e · claimed
- 2026-08-02 17:27Z illodev@local#aed59c5e · doing → done

## Notes

- 2026-08-02 17:27Z illodev@local#aed59c5e — Wider than this card described, and the reason it stayed hidden is worth
recording: the invariant was doing the refusing, by accident.

`card patch '{"status":"review"}'` on a card alice holds is rejected — but with
`CARD_CLAIM_STATUS_INVALID`, because a claimed card must be `doing`, not
because anyone checked who holds it. Satisfy the invariant and the door opens:

    {"status":"review","claimed_by":null,"claimed_at":null}   ->  T-0001 updated

A third actor dropped alice's claim and moved her card. No force, no reason, no
refusal. So there were two exploits, not one: writing a different name took the
card over, and clearing the field let it go — and `patchCard` had no ownership
guard at all, only an invariant that happened to block the most obvious shape.

Fixed by giving all three doors one check. `assertClaimOwnership` takes the
card as read under the lock and computes the verdict itself, the way
`assertAcceptanceMet` does — deliberately not the shape [[T-0108]] shipped,
where the caller passes a decision in. `transitionCard` and `releaseCard` each
had their own copy and now call it; `releaseCard`'s copy also lacked the "pass
force with a reason" hint and the details object, so both improve by being
deleted.

Scoped to `status`, `claimed_by` and `claimed_at`, which is exactly what the
other two doors already defend. Patching a priority on someone else's card is
still allowed, because refusing it would be a new rule rather than the missing
half of an old one.

`claimCard` keeps its own richer rule instead of calling the shared one. Taking
a claim over is the job it exists for, so it weighs staleness and demands a
reason it writes into the card — verified still working, `bob replaced alice's
claim: alice is out` lands in `## Notes`.

The fourth criterion taken on its first branch rather than its escape hatch: a
patch that hands the card over or lets it go now writes a trail line, so the
record no longer depends on which command was used. One patch that both moves
the card and releases it writes two lines, because two things happened.

Verified from the CLI, before and after, on throwaway workspaces:

    robo directo del titular   ->  CARD_CLAIM_OWNER_MISMATCH
    tirar el claim + mover     ->  CARD_CLAIM_OWNER_MISMATCH
    campo benigno ajeno        ->  updated, card still alice's, still doing
    claim --force --reason     ->  claimed by bob, reason written
    patch que suelta (propio)  ->  "doing → review" then "released"

229 + 7 tests pass, strict holds at baseline. The new test pins both exploits,
the benign patch, the forced takeover and the two trail lines.
