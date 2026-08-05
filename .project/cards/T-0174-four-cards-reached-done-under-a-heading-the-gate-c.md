---
id: T-0174
title: Four cards reached done under a heading the gate could not read
status: backlog
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

- [ ] Each of T-0026 through T-0029 is verified and checked, or reopened
- [ ] `doctor` reports no `done-unchecked` warnings on this repository
- [ ] Whether the four bodies keep `## Acceptance` or move to the canonical heading is settled
