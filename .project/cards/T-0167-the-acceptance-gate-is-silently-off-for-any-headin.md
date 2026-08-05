---
id: T-0167
title: The acceptance gate is silently off for any heading the parser does not know
status: review
type: bug
priority: critical
area: core
tags: [acceptance, doctor, field-report]
origin: [DOC-0005]
created: 2026-08-05
updated: 2026-08-05
scope: [packages/workfile/src/modules/cards/acceptance.ts, packages/workfile/src/modules/cards/mutations.ts, packages/workfile/src/modules/doctor]
related: [T-0158, ADR-0012]
---

An external tester ran a board in Spanish and closed a card that had two
unproven criteria ([[DOC-0005]], finding 8). The report read that as the
protocol promising a guarantee the state machine never implemented. It is not
that: the gate shipped in 0.3.0 ([[CHG-0048]]) and works. It was handed a card
with no criteria and did the right thing with it.

`HEADING` in `packages/workfile/src/modules/cards/acceptance.ts:27` matches one
English phrase:

```
/^(#{1,6})\s+acceptance\s+criteria\b.*$/im
```

Everything else parses as absent, and absent is indistinguishable from empty.

## This is not a translation bug

The first version of this card proposed teaching the parser the translated
headings. That was wrong twice over. [[ADR-0012]] removes Spanish output
entirely — the owner's decision, recorded against [[T-0158]] — so there is no
configured language left to key a translation off. And the exposure was never
Spanish in the first place. Measured on 0.6.0, five headings against the same
two checklist items:

```
Success criteria           -> T-0004 declares no acceptance criteria
Criteria                   -> T-0005 declares no acceptance criteria
Definition of done         -> T-0008 declares no acceptance criteria
Acceptance Criteria:       -> T-0006 — 0 of 2 met
Acceptance criteria (v2)   -> T-0007 — 0 of 2 met
```

`## Definition of done` is not a mistake anyone would catch themselves making.
It disables the gate exactly as thoroughly as `## Criterio de aceptación` did,
in English, on a board doing nothing unusual. Removing Spanish narrows who
walks into this. It does not make the gate honest.

## What the defect actually is

Silence. Three surfaces agree there is nothing to check, and all three are
reporting the same missing information as if it were a fact:

```
$ workfile card ac T-0008
T-0008 declares no acceptance criteria     ← it declares two
$ workfile card transition T-0008 done
T-0008 → done                              ← the gate had nothing to hold
$ workfile doctor
Workfile doctor: 0 errors, 0 warnings
```

"Declares no acceptance criteria" is a claim about the card. The parser is not
entitled to it — what it knows is that it found no heading it recognised. A
body carrying unchecked checklist items that no heading claimed is evidence
against that reading, and it is sitting right there in the file.

This is why the severity stays where the report did not put it. `done` is the
one hard guarantee this product makes. A guarantee that can be switched off by
a heading, without a word from the health check that exists to catch it, is not
a guarantee.

## Design notes

Widening the pattern is the obvious move and it is a treadmill: `Definition of
done` today, `Exit criteria` next. The heading vocabulary can be widened, but
the card is not finished when it is — the check that closes this is the one
that notices orphan checklist items whatever they sit under.

Two calls to make rather than assume:

**Whether an orphan is an error or a warning in `doctor`.** A card can
legitimately contain a checklist that is not acceptance criteria — a research
card listing sources to read. Warning is the safer default and the false
positive is cheap; erroring would fail `doctor` on bodies that are correct.

**Whether `done` consults it.** Refusing `done` on a card with orphan items
closes the hole completely and is also the change most likely to block someone
whose checklist was never a criterion. The weaker version — `done` passes but
says what it saw — leaves the decision with the person and still breaks the
silence.

`card ac` should stop asserting the negative regardless of either answer.

Related: [[T-0158]] and [[ADR-0012]] remove the Spanish that produced the
original report. This card is what is left when they land.

## Acceptance criteria

- [x] A body with checklist items under no recognised heading is reported, not read as empty
- [x] `card ac` distinguishes "no criteria" from "no heading I recognised"
- [x] `doctor` surfaces the card the tester closed, from its body alone
- [x] The recognised heading vocabulary covers `Definition of done` and `Success criteria`
- [x] Whether `done` refuses on an orphan checklist is decided and recorded

## Activity

- 2026-08-05 10:41Z illodev@local#2cddaf94 · claimed
- 2026-08-05 10:42Z illodev@local#2cddaf94 · released
- 2026-08-05 10:42Z illodev@local#2cddaf94 · renamed file to T-0167-the-acceptance-gate-is-silently-off-for-any-headin.md
- 2026-08-05 10:46Z illodev@local#2cddaf94 · claimed
- 2026-08-05 10:55Z illodev@local#2cddaf94 · doing → review

## Notes

- 2026-08-05 10:55Z illodev@local#2cddaf94 — Decision on the two open calls, both taken with the owner before code moved: a checklist under no recognised heading is a doctor WARNING, not an error, because a card may legitimately keep a list that was never a criterion and failing doctor on a correct body costs more than the false positive; and `done` REFUSES with CARD_ACCEPTANCE_UNREADABLE, with force as the escape, symmetric with the CARD_ACCEPTANCE_UNMET gate that already says 'Check them, or pass force'. Recorded in CHG-0114.
