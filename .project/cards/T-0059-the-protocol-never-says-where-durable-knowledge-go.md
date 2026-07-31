---
id: T-0059
title: The protocol never says where durable knowledge goes
status: done
type: docs
priority: medium
area: docs
source: .project/docs/research/DOC-0001-fube-session-feedback-verified-triage.md
tags: [fube-feedback, protocol, memory]
scope: [packages/workfile/src/modules/agents, .project/agents]
created: 2026-07-31
updated: 2026-07-31
---

`.project/agents/workflows/record-knowledge.md` explains how to choose between
memory *collections* — learning, decision, incident, convention, context. It never
explains when the thing belongs in memory at all, versus a card note, versus a
document.

All three fit "I learned this and it must not be lost". Facing that at the moment
of writing, a reporting agent used whichever record was already open — card notes,
about eighteen times — and touched none of the 21 memory records in the
repository, despite `CLAUDE.md` telling it to record durable knowledge there.

The failure is silent and compounding: knowledge lands somewhere reasonable, and
the collection meant to be searched first stays empty.

## Scope

One rule, at the top of `record-knowledge.md`, short enough to survive being
read under load. A starting proposal:

- **Card note** — evidence about *this* card. Dies with it.
- **Memory** — outlives the card and changes how future work is done.
- **Doc** — reference material someone will read start to finish.

The mirror rule matters as much: what belongs in the agent's own memory rather
than the repository's, which is the boundary the reporter was actually standing
on when it chose wrong.

Both this and the protocol's "Essential commands" block are canonical surfaces,
so the change ships through `agents sync`, not by hand-editing the generated
files.

## Activity

- 2026-07-31 20:52Z session-fube-triage · claimed
- 2026-07-31 21:02Z session-fube-triage · doing → done

## Verification

- 2026-07-31 21:02Z session-fube-triage — Written into the canonical template in src/modules/agents/agents.ts, both languages, and shipped through `agents sync` rather than by editing the generated file: protocol.md and record-knowledge.md both report `updated`, with new digests at 0.1.9. Runtime: a freshly initialised workspace carries the rule at the top of record-knowledge.md — card note dies with the card, memory outlives it, doc is read start to finish, prefer memory when two fit. The tie-breaker is the part that does the work: the reporting agent's failure was not misclassifying, it was defaulting to whatever record was already open.
