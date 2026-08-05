---
id: T-0210
title: Nothing on a card says whether a person reported it or an agent inferred it
status: backlog
type: feature
priority: medium
area: core
tags: [protocol]
effort: S
scope: [packages/workfile/src/modules/cards]
created: 2026-08-05
updated: 2026-08-05
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

- [ ] A card records whether it was reported or derived, in a form that can be counted without parsing prose.
- [ ] The vocabulary is small, declared, and validated on write.
- [ ] Every surface that creates a card can set it: CLI, MCP and HTTP.
- [ ] `doctor` reports a card that carries none, as a warning rather than an error.
- [ ] Existing cards are left unmarked rather than guessed at, and that is stated.
- [ ] The agent protocol says to set it, in the workflow that files a card.
