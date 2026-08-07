---
id: T-0210
title: Nothing on a card says whether a person reported it or an agent inferred it
status: done
type: feature
priority: medium
area: core
tags: [protocol]
effort: S
scope: [packages/workfile/src/modules/cards]
created: 2026-08-05
updated: 2026-08-07
verified:
  at: "2026-08-07T23:51:17.103Z"
  method: local
  commit: eb12a11b8e26cedc67bcaf0b279e80542b40b4d7
  digest: "sha256:c57cb42ef79f929b2aed0bfa82975ba65b870920f19de81b85a792540ae5238d"
---

Asked where one of eight cards came from, I could not answer from the record. I
read the commit message that filed them, inferred from how its paragraphs were
grouped that the card was mine rather than reported, and said so. It was
reported — it is item six of a list the owner had written out. The inference was
wrong and the record could not correct it, because the record does not carry the
fact at all.

The fields that look like they should are both something else. `origin` takes
record ids, which is the provenance of discovered work — T-0154 built it, and it
answers "what were you doing when you found this". `source` takes a
repository-relative path and is checked on disk (SPEC §11), so a report made in
conversation has nothing to put there.

The distinction matters more as more of the work is agent-filed. A card a person
reported is a commitment to somebody; a card an agent inferred from reading code
is a proposal, and discarding it costs nothing. Six months of cards with those
two mixed together is a backlog nobody can prioritise, and the difference is
unrecoverable after the session ends.

## What has to be decided

**Where it goes.** A frontmatter field is countable but holds one value. The
activity trail already records who did what and is append-only, and the first
line of every card's trail is its creation — so the honest place may be there,
with `createCard` taking the phrase. Probably both: the trail for the history, a
field for the query.

**What the vocabulary is.** Two values do most of the work — reported, and
derived. A third for work that came out of an incident or a review may earn its
place; more than that and nobody will pick correctly.

**Whether it is enforced.** A convention nothing checks is a convention that
rots — this repository's own eight cards are the evidence. A doctor rule that
reports a card with no provenance is the cheapest enforcement, and it should
warn rather than fail, since every card filed before this lands has none.

**Backfill.** Cards already filed cannot be classified reliably, and guessing
would reproduce the exact error that prompted this. They stay unmarked.

## Acceptance criteria

- [x] A card records whether it was reported or derived, in a form that can be counted without parsing prose.
- [x] The vocabulary is small, declared, and validated on write.
- [x] Every surface that creates a card can set it: CLI, MCP and HTTP.
- [x] `doctor` reports a card that carries none, as a warning rather than an error.
- [x] Existing cards are left unmarked rather than guessed at, and that is stated.
- [x] The agent protocol says to set it, in the workflow that files a card.

## Activity

- 2026-08-07 23:36Z illodev@local#42eb42f5 · claimed
- 2026-08-07 23:51Z illodev@local#42eb42f5 · released

## Notes

- 2026-08-07 23:51Z illodev@local#42eb42f5 — One thing the card left open, settled here: the doctor rule is bounded by date. Warning on every card that carries none would have reported 223 in this repository on the day the field shipped, and backfilling is not available — guessing which of them were reported reproduces the exact error that prompted the card. So the rule speaks about cards filed from 2026-08-08 and says nothing about the ones that could not answer. A date rather than a config value: a project does not choose when the field became available in the package it installed, and a knob would only be used to switch the rule off, which `--severity` and the baseline already do per project with a record of the decision.

The field is `raised`, values `reported` and `derived`. Two existing guards caught what a new card field needs beyond the field itself: it has to be reserved against being declared an axis, and it has to be reachable from a `card create` flag. Both were failing tests, not things I remembered.
- 2026-08-07 23:51Z illodev@local#42eb42f5 — local verification: `raised` reaches a card through the CLI, MCP and HTTP, validated to two values with `CARD_RAISED_INVALID` on anything else, verified end to end with the shipped binary. No default: a card filed without it is one nobody classified, which is the fact worth keeping. The doctor rule fires for a card filed after the field existed and stays silent for one filed before, proven against a card dated past the cutoff rather than by waiting for the clock; answering it silences the rule. The generated `discovered-work` workflow now tells an agent to set it and says why the difference is unrecoverable. Reserved against being declared an axis and covered by the create-flag parity test, both of which were failing tests rather than things I remembered. Full gate green at 488 + 10.
