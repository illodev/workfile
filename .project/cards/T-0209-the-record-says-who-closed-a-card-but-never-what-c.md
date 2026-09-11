---
id: T-0209
title: The record says who closed a card but never what closed it
status: done
type: feature
priority: medium
area: core
tags: [protocol, stats]
effort: M
scope: [packages/workfile/src/modules/cards, packages/workfile/src/core, packages/workfile/src/types.ts, packages/workfile/src/config/defaults.ts, packages/workfile/src/runtime/claude/hooks.mjs, packages/workfile/bin/workfile.ts, packages/workfile/src/modules/mcp/tools.ts, packages/workfile/docs]
origin: [ADR-0016]
created: 2026-08-05
updated: 2026-09-11
produced_by:
  model: claude-fable-5-1
  reasoning: xhigh
  basis: self-reported
verified:
  at: "2026-09-11T18:46:20.011Z"
  method: manual
  commit: a040d50ac2d5266d8849a477886a737d4f7c0054
  digest: "sha256:18758753a5dc91ad02039d37e80194a94cd7026d2bc0c0095c54618dcd786bcb"
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

## Decided and built

Beside the actor, never inside it (owner, 2026-09-11). `resolveProducer` in
`modules/cards/producer.ts` reads, in order, `WORKFILE_MODEL` then `ANTHROPIC_MODEL`;
`WORKFILE_REASONING` then `CLAUDE_EFFORT` (documented as exported to the Bash tool and hooks) then
`CLAUDE_CODE_EFFORT_LEVEL`; and last the session file, where the Claude hook now copies `model` off
a `SessionStart` payload when the host includes it and `effort.level` off every tool-use event.
Every card door passes the result to `mutateCard`, which writes `produced_by: { model, reasoning,
basis: self-reported }` after the trail line and the verification, and `activityEntry` and
`appendCardNote` put the same producer on the line as a `via:MODEL/REASONING` token — one `\S+`,
so `TRAIL_ENTRY`, `NOTE_ENTRY` and every actor comparison read what they read before. A half nobody
declared is written as `undeclared`; a value outside `[A-Za-z0-9._:+-]{1,64}` is refused by name on
stderr and never written. Not patchable (`CARD_FIELD_NOT_PATCHABLE`), reserved against axes, carried
in listings so `card list --json` counts it, and `doctor` reports `produced-by-invalid` for a hand
edit. With nothing declared the record is byte-identical to before — pinned by `producer.test.ts`.

Not done, on purpose: a `PostModelSwitch` hook would follow a mid-session `/model` change; it
needs a minimum host version this package does not yet pin, so the model is what `SessionStart`
said until the next start. `effort` does follow, from every tool call.

## Acceptance criteria

- [x] A card records what produced each protocol write, alongside the actor rather than inside it.
- [x] Model and reasoning budget are both recorded, or the field states why one of them is absent.
- [x] It is self-reported and the record says so, so nobody reads it as attested.
- [x] The claim guard's actor comparison is unaffected, proven by a test.
- [x] A workspace with nothing declaring it behaves exactly as today.
- [x] The stored shape can be counted over without parsing prose.
- [x] Nothing sensitive can reach the record through it.

## Notes

- 2026-09-11 17:32Z illodev@local#597ecdc9 — Decided by the owner on 2026-09-11: a produced_by field beside the actor, never inside it. Self-declared from the environment (WORKFILE_MODEL, WORKFILE_REASONING, or whatever the Claude hook can inject from its own session), written on the trail line and as a last-writer field in frontmatter, labelled self-reported. With nothing declared the record is byte-identical to today, and the claim guard keeps comparing actors alone. This card leaves the T-0183 epic and stands on its own.
- 2026-09-11 18:45Z illodev@local#597ecdc9 via:claude-fable-5-1/xhigh — Live producer probe from this Claude Code session: WORKFILE_MODEL declared by the agent, reasoning taken from the host's CLAUDE_EFFORT — this line and the produced_by block below it are the evidence.
- 2026-09-11 18:45Z illodev@local#597ecdc9 via:undeclared/xhigh — Probe of a refused label: this line must read via:undeclared/xhigh and the model must say undeclared.
- 2026-09-11 18:45Z illodev@local#597ecdc9 via:claude-fable-5-1/xhigh — Live evidence on 2026-09-11 in this Claude Code session with the built dist: 'card note' with WORKFILE_MODEL=claude-fable-5-1 and the host's CLAUDE_EFFORT=xhigh wrote the note line '… illodev@local#597ecdc9 via:claude-fable-5-1/xhigh — …' and produced_by { model claude-fable-5-1, reasoning xhigh, basis self-reported }; claimed_by stayed illodev@local#597ecdc9 and the edit guard kept treating the claim as this session's. A second note with WORKFILE_MODEL='has spaces' printed 'note: WORKFILE_MODEL ignored — a producer label is at most 64 characters …' and wrote via:undeclared/xhigh with model undeclared. producer.test.ts (4 cases: beside-the-actor + claimSeparation unchanged, byte-identical without declaration, undeclared halves + refused labels + session-file rung, doctor produced-by-invalid) and the hook test for model/effort capture; suite 531/531, strict held at 424.
- 2026-09-11 18:46Z illodev@local#597ecdc9 — manual verification: Live in this Claude Code session on 2026-09-11 with the built dist: a real 'card note' on this card wrote the trail token via:claude-fable-5-1/xhigh (model self-declared through WORKFILE_MODEL, reasoning from the host-exported CLAUDE_EFFORT) and produced_by { claude-fable-5-1, xhigh, self-reported } while claimed_by stayed illodev@local#597ecdc9; a refused label printed the stderr note and wrote model undeclared; the installed PostToolUse hook copied effort xhigh into this session's file. producer.test.ts 4/4, claude-surface hook test green, suite 531/531, strict held, doctor clean.

## Activity

- 2026-09-11 18:33Z illodev@local#597ecdc9 · claimed
- 2026-09-11 18:46Z illodev@local#597ecdc9 via:claude-fable-5-1/xhigh · doing → done
