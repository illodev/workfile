---
id: CHG-0188
title: A card records what produced each write, beside who made it
type: added
area: core
visibility: public
cards: [T-0209]
created: 2026-09-11
updated: 2026-09-11
---

The activity trail recorded an actor — which human, which session — and nothing about what did the work. Two cards closed a day apart by the same actor may have been written by different models at different reasoning budgets, and nothing could tell them apart afterwards.

A writer can now declare what produced its writes — `WORKFILE_MODEL` and `WORKFILE_REASONING`, or the host's own `CLAUDE_EFFORT`, or what the Claude hook copies into the session file from a `SessionStart` payload — and every card write records it beside the actor: as a `via:MODEL/REASONING` token on the trail line and as a `produced_by` block in frontmatter, so `card list --json` can be counted over by model. The block says `basis: self-reported`, because an environment variable is anyone's word. A value that is not a label of at most 64 token characters is refused with a note, never written. With nothing declared the record is byte-identical to before, and `claimed_by` and the edit guard's actor comparison are untouched either way. `doctor` gains `produced-by-invalid` for a hand-edited block.
