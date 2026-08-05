---
id: CHG-0117
title: A card's context bundle carries the memory that is about that card
type: changed
area: core
visibility: public
created: 2026-08-05
updated: 2026-08-05
---
Opening a card handed the agent every memory record in the workspace. Two
unrelated cards — one about a render loop, one about a locomotion model — got
byte-identical bundles, and `protocol.md` line 12 tells agents to *"load the
smallest relevant context; do not inject all workfile memory into every
prompt"*. The command implementing that rule was the one breaking it.

`scopeMatches` was meant to be the filter and could not be. It returns true
whenever either side declares no scope, `memory add` sets none, and most cards
carry none either, so in an ordinary workspace it passed everything and the
20-record cap was all that bounded the bundle. A filter that only works on
annotated records is a no-op, because the annotation is what nobody fills in.

Memory is ranked against the card now, by the same search `workfile search`
exposes — no second notion of relevance, and no annotation required:

```
$ workfile agents context --card T-0001   # "The render loop drops frames"
## T-0001 — The render loop drops frames above 60 Hz
## CONV-0001 — Protocol records are written in English
## LRN-0001 — Render loop budget: 16ms per frame
**Left out**: 4 below the relevance threshold for this card.
```

**Conventions and decisions are exempt.** They are normative: a rule and a
choice nothing may silently contradict bind a card that shares no vocabulary
with them. CONV-0001 has nothing in common with a render loop and governs it
completely. Learnings, incidents and context describe a subject, and a subject
is what relevance can judge.

**A record the card names is never filtered.** `related`, `depends`, `origin`
and the rest come in above relevance, whatever they score.

**The bundle says what it left out**, in the markdown and as `omitted` on the
JSON, split into what relevance dropped and what `--limit` cut. A bundle that
quietly drops records reads exactly like a workspace that has none. Kept
separate from `truncated` rather than folded into it — see T-0147 for what
happens when one field carries two meanings.

Session start is unchanged: with no card there is nothing for relevance to be
relative to, and the bundle keeps everything it qualified for.
