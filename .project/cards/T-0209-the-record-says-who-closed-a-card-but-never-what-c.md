---
id: T-0209
title: The record says who closed a card but never what closed it
status: backlog
type: feature
priority: medium
area: core
parent: T-0183
tags: [protocol, stats]
effort: M
scope: [packages/workfile/src/core/actor.ts]
origin: [ADR-0016]
created: 2026-08-05
updated: 2026-08-05
---

The activity trail records an actor — `illodev@local#bf4c5f67` — which says which
human and which session, and nothing about what did the work. Two cards closed a
day apart by the same actor may have been written by different models at
different reasoning budgets, and there is no way to tell them apart afterwards.

The point is the statistics. Once a few hundred cards carry it, the questions
worth asking become answerable: which model closes a card without it being
reopened, which one needs forcing past the gate, which one files the follow-up
work it discovered instead of leaving it. None of that is answerable now, and
none of it can be backfilled — the fact is only available at the moment the write
happens.

This is the same shape as T-0186's `verified` block, which records the *method*
that proved a card. That answers "how was this shown to be true"; this answers
"what produced it". They belong next to each other and should be designed
together, which is why this sits under the same epic.

## What has to be decided

**Where it comes from.** `resolveActor` derives identity from the environment
already. A model name is another environment fact, but an agent can set an
environment variable to whatever it likes, so this is self-reported and must be
labelled as such — the same honesty `method: local` carries in ADR-0016.

**Whether it rides the actor or sits beside it.** Folding it into the actor
string makes every existing trail line's grammar ambiguous and breaks the claim
guard, which compares actors for equality. Beside it is almost certainly right.

**Where it is stored.** The trail is append-only prose and is already the record
of who did what, but it is prose — counting over it means parsing it. A field is
countable but only holds the last writer. Both may be needed: the trail entry for
the history, a frontmatter field for the query.

**Effort and configuration.** The card asks for model *and* effort. Reasoning
budget is the difference between two runs of the same model, so a statistic
without it compares things that are not comparable. What else belongs — a
temperature, a tool set — should be bounded now rather than left as a free-form
bag that becomes unqueryable.

**What must never land here.** No credentials, no API keys, no prompt text.

Raised in the same triage as T-0191 through T-0198 and not filed at the time.

## Acceptance criteria

- [ ] A card records what produced each protocol write, alongside the actor rather than inside it.
- [ ] Model and reasoning budget are both recorded, or the field states why one of them is absent.
- [ ] It is self-reported and the record says so, so nobody reads it as attested.
- [ ] The claim guard's actor comparison is unaffected, proven by a test.
- [ ] A workspace with nothing declaring it behaves exactly as today.
- [ ] The stored shape can be counted over without parsing prose.
- [ ] Nothing sensitive can reach the record through it.
