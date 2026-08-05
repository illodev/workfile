---
id: T-0172
title: The context bundle still carries every memory record the workspace has
status: backlog
type: bug
priority: high
area: core
tags: [context, memory, field-report]
origin: [DOC-0005]
created: 2026-08-05
updated: 2026-08-05
---

[[DOC-0005]] (finding 1) is the report's own top pick, and it survives 0.6.0
with the edges filed off. Two unrelated cards in a fresh workspace — one about
a render loop, one about a locomotion model — still receive an identical
memory set:

```
$ workfile agents context --card T-0001 | grep -E '^## [A-Z]+-[0-9]+'
## T-0001 — Tarjeta con criterios en espanol
## LRN-0001 — Render loop budget
## LRN-0002 — Locomotion model
## LRN-0003 — Texture atlas
## LRN-0004 — Audio bus
## LRN-0005 — Input mapping

$ workfile agents context --card T-0002 | grep -E '^## [A-Z]+-[0-9]+'
## T-0002 — Card with english criteria
## LRN-0001 … LRN-0005      (the same five)
```

0.6.0 did add two things the report was measuring without: the bundle is capped
(`maxRecords`, default 20, ceiling 50) and records are ordered — focus, then
direct links, then in-flight, then conventions, decisions, incidents, learnings,
contexts. So the encyclopedia is now truncated and the relevant records sort
first. That is a real improvement and it is not the fix.

The filter that was supposed to do this work is `scopeMatches`
(`modules/agents/agents.ts:466`):

```
if (!recordScope?.length || !cardScope?.length) return true;
```

Either side missing means everything matches. `memory add` sets no scope, and
most cards do not carry one either, so in the common workspace the filter is a
no-op and the cap is the only thing standing between a card and the whole of
memory. At 50 records the truncation is what protects the prompt — and
[[T-0147]] is already open on the fact that truncation does not report itself
honestly.

The report's sharpest point is that this contradicts the protocol the command
exists to serve. `protocol.md` line 12: *"Load the smallest relevant context; do
not inject all workfile memory into every prompt."*

What this card must not do is treat scope as the whole answer. Scope is
declared by hand and mostly absent; a filter that only works when someone
remembered to fill a field will keep being a no-op. The report lists the
alternatives worth weighing — area, tags shared with the card, explicit
relation, proximity ordering under `--limit` — and at least one of them has to
work on records nobody annotated.

Adjacent and not the same: [[T-0080]] (the bundle came back empty), [[T-0087]]
(scoped records vanished from the card-less bundle), [[T-0147]] (truncation
overwrites its own flag). This card is about what gets in, not about what is
lost on the way out.

## Acceptance criteria

- [ ] Two unrelated cards in a workspace with unscoped memory get different bundles
- [ ] Relevance works on records that declare no scope
- [ ] A record excluded by relevance is still reachable by an explicit relation
- [ ] The bundle states what it left out, consistently with [[T-0147]]
