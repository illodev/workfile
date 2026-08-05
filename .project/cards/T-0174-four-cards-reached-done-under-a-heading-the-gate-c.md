---
id: T-0174
title: Four cards reached done under a heading the gate could not read
status: review
type: task
priority: medium
area: core
tags: [acceptance, field-report]
origin: [T-0167]
created: 2026-08-05
updated: 2026-08-05
---

Widening the acceptance reader under [[T-0167]] made four cards in this
repository report what they had been hiding since 0.1.x:

```
WARNING done-unchecked T-0026: Done card has 2 unproven acceptance criteria
WARNING done-unchecked T-0027: Done card has 2 unproven acceptance criteria
WARNING done-unchecked T-0028: Done card has 2 unproven acceptance criteria
WARNING done-unchecked T-0029: Done card has 2 unproven acceptance criteria
```

All four wrote their criteria under `## Acceptance`, which the reader did not
know, so `parseAcceptance` returned nothing, the gate had nothing to hold, and
`doctor` had nothing to report. They went to `done` without the gate ever
running. This is the same defect DOC-0005 reported from outside, found at home
and in English.

What is not established is whether the work is actually unproven. All four
shipped — they are the `search-local` cards from the 0.1.x era — and the likely
reading is that the criteria were met and the boxes were simply never ticked,
because nothing ever asked. Likely is not verified, which is the whole point of
the rule they walked past.

Deliberately not done here: checking the boxes. Ticking a criterion is a claim
that it was verified, and nobody who can make that claim about these four is in
this session. The options per card are to verify and check, or to reopen, and
both belong to whoever shipped them.

Until then `doctor` carries four warnings. They are honest and they should stay
visible rather than be silenced.

## Acceptance criteria

- [x] Each of T-0026 through T-0029 is verified and checked, or reopened
- [x] `doctor` reports no `done-unchecked` warnings on this repository
- [x] Whether the four bodies keep `## Acceptance` or move to the canonical heading is settled

## Activity

- 2026-08-05 11:57Z illodev@local#2cddaf94 · claimed
- 2026-08-05 12:03Z illodev@local#2cddaf94 · doing → review

## Notes

- 2026-08-05 12:03Z illodev@local#2cddaf94 — All four verified and checked; none reopened. `doctor` is 0 errors, 0 warnings.

Most of the evidence already existed and I had not read for it. The Notes on T-0026 through T-0028 carry a runtime verification on a consumer workspace dated 2026-07-30 21:18Z — Fube, roughly 3,200 records, 0.1.3 published — covering exactly the criteria that looked unprovable from the test names alone. Judging by test names was the wrong reading; the cards said more than the suite did.

Two criteria were genuinely unmet as written, and now have the tests they asked for: T-0026 #2 wanted a test loading the guarded config where the package does not resolve, and T-0029 #1 wanted every owned surface stamped, where the existing test owned one. Both are in the suite, both were checked for vacuity — the guarded-config test against an unguarded control that fails with ERR_MODULE_NOT_FOUND, the upgrade test by asserting the file count before looping over it.

The heading question settles as: they keep `## Acceptance`. T-0167 taught the reader that heading, and the proof is that doctor found these four at all. Moving them would be churn for uniformity, and the canonical form is not more correct now that the reader knows both.

T-0027 #2 was an alternative rather than a requirement, which the format cannot express. Recorded as [[LRN-0020]], because the next card written that way will not be noticed either.
