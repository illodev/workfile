---
id: LRN-0005
title: A proposal asserting a repo fact is not a proposal until the fact is checked
status: active
created: 2026-08-01
updated: 2026-08-01
confidence: high
---
A 50-agent landscape study produced a 28-item list of mechanics to copy, each
framed as "the Workfile problem it solves". None of those problem statements was
ever compared to the repository. A second pass checked all 28, plus 28 ideas the
study generated and never verified.

**51 of the 56 asserted something about this repository that is false.** 133
individual false claims. Examples, each settled by one command:

- "`card note` appends to one hardcoded heading" — `--section NAME` is a
  documented flag.
- "SPEC §18.1 specifies `doctor --changed`" — it specifies `--new`; the quoted
  text is from the legacy v1 fixture kept as a migration test.
- "The UI makes 27 sequential round trips, 11.1 MB" — one round trip, 287 KB.
  Those megabytes are the 8,000-card synthetic bench fixture.
- "The index cache stops working around 65k records" — measured density puts the
  wall near 274k.

The failure is not sloppiness about the competitors. The deep reads were
accurate. It is that a mechanic's *value* was inferred from the competitor's
code and its *justification* was invented about ours, and only the first half
was ever checked.

**Why:** a proposal is a claim about two systems. Reading the other one is the
expensive half and the part that feels like research; checking ours costs one
grep and feels like a formality. So the cheap half is the one that gets skipped,
and the resulting item reads as well-researched precisely because the researched
half is visible.

The same shape killed T-0081 the day before: a performance claim that passed
adversarial verification — which asked "does this exist?" and "does this
conflict with an ADR?" — and was still false, because nobody measured until the
work was already done.

**How to apply:**

- An item that asserts a fact about this repository is not actionable until that
  fact is checked. Not plausible — checked, with the command in the record.
- Where the assertion is a number, measure it here. A number from a bench
  fixture is a number about the bench fixture.
- Adversarial verification is not measurement. "Does it exist" and "does it
  conflict" are the two questions that let both of these through.
- Value the pass by its kills, not its survivors. Of the eight items that
  survived here, not one survived as proposed: every one was either redirected
  onto a defect it had walked past or reduced to the smallest true thing inside
  it. Two live defects were found underneath items whose stated premise was
  wrong.
