---
id: T-0117
title: card patch takes over another actor's claim silently
status: backlog
type: bug
priority: high
area: core
scope: [packages/workfile/src/modules/cards/mutations.ts]
related: [T-0108]
created: 2026-08-02
updated: 2026-08-02
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

- [ ] Patching `claimed_by` or `claimed_at` is refused for a card another actor
      holds, on the same terms `claimCard` refuses it
- [ ] Taking a claim over deliberately still works, and still records why
- [ ] The guard is shared with the other three writers rather than restated
- [ ] A change of holder leaves a trail line, or the decision not to is recorded
