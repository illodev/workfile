---
id: T-0157
title: card write silently drops everything below a protocol heading
status: done
type: bug
priority: medium
area: core
created: 2026-08-04
updated: 2026-08-05
origin: [T-0155]
scope: [packages/workfile/src/modules/cards/mutations.ts]
---

`patchCardBody` protects `## Activity` and `## Notes` from being replaced —
correctly, they are append-only, and T-0115 exists because a body write once
erased the trail. But the protection is **positional, not by heading**:
`protocolSectionsAt` returns the lowest index of either heading, and everything
from there to the end of the body is carried over from the stored copy,
whatever it is.

So a card whose body has any content *below* `## Notes` can never have that
content corrected. The command reports success.

## Reproduced

Throwaway workspace, `dist` at 0.5.4. Card created with this body:

```text
Original prose.

## Notes

Old note.

## Acceptance criteria

- [ ] old criterion
```

Then `card write` with every line changed — new prose, new note, new criterion.
It printed `T-0003 body written`, exit `0`, and the body is now:

```text
REWRITTEN prose.

## Notes

Old note.

## Acceptance criteria

- [ ] old criterion
```

The prose landed. The note reverting is by design. **The acceptance criteria
reverting is not** — that section has no protocol meaning; it was frozen purely
for sitting after `## Notes`.

## Why this matters more than it looks

Acceptance criteria are the gate on `done`: `assertAcceptanceMet` refuses a
transition while any is unchecked. A card that acquires a `## Notes` heading
above its criteria has a criteria list the CLI can no longer rewrite —
`card ac --check` still works, because it edits by index through
`setCardAcceptance`, so the list can be *ticked* but not *corrected*.

And `project_card_write` is agent-facing. The comment above
`PROTOCOL_SECTIONS` says exactly that about T-0115. An agent gets a success
message and a half-applied write, which this repository has already named the
worst failure shape available: the instruction evaporates and the exit code
says it worked.

SPEC 11.2's example body puts `## Notes` last, so the convention is right.
Nothing enforces it, warns about it, or reports it afterwards.

## Options

Something should stop being silent; which thing is the design question.

1. **Refuse the write.** If the sent body would drop stored content below a
   protocol heading, fail with a code naming the heading. Loudest, and
   consistent with how the CLI treats a flag it cannot honour.
2. **Protect the sections, not the tail.** Carry over each protocol section
   individually and let the caller rewrite everything else in place. Most
   useful, most work, and needs a rule for where a rewritten section lands.
3. **Refuse at authoring time.** `card create` rejects a body with content
   below a protocol heading, so the state is unreachable. Cheapest, does
   nothing for the cards that already have it.

Whatever wins, a doctor rule for existing cards in this shape is worth having;
it is invisible until somebody tries to edit one.

## Decided

[[ADR-0011]] takes option 2. A body write carries over the *content* of the
protocol sections and nothing else, so everything below them belongs to the
caller again; a caller that edits inside them is ignored there and told so, in
`ignored`, on all three surfaces.

Two things were found while building it, both worse than what this card
describes. The heading search read `## Activity` and `## Notes` out of fenced
blocks *and* out of inline code — so the trail of four cards in this repository
had been written into their prose, T-0108's entire four-entry trail among them,
because the cards written about the trail are the ones that name it in a
sentence. And the same search is what `card note` and the trail itself use, so
the damage was being written by the protocol rather than merely tolerated by
it.

The reading is now a line scan that tracks fence state, shared by every writer,
and `doctor --fix` moves stray entries back where they belong.

## Discovered by

Authoring [[T-0155]] with a `## Notes` section above its acceptance criteria,
then correcting a wrong card reference in it. The first `card write` fixed the
prose and left the criterion pointing at the wrong card; the second appended a
duplicate of the whole tail. The card was repaired by editing the file, which
is safe here only because `revision` is derived from content rather than
stored. There is no CLI path back from that state.

## Acceptance criteria

- [x] The chosen option is recorded as a decision before it is built
- [x] A body write either applies fully or fails naming what it could not write
- [x] The repro above passes under the new behaviour
- [x] A card already in this shape is reachable — repaired or reported
- [x] `pnpm run check` green, doctor 0/0

## Activity

- 2026-08-04 23:13Z illodev@local#cfe281b4 · claimed
- 2026-08-04 23:35Z illodev@local#cfe281b4 · moved 1 trail entry into the trail
- 2026-08-04 23:40Z illodev@local#cfe281b4 · doing → review
- 2026-08-05 00:15Z illodev@local#cfe281b4 · review → done

## Notes

- 2026-08-05 00:15Z illodev@local#cfe281b4 — Verified on merged main (a93e05e) against a clean workspace built from dist: prose rewritten including a sentence naming `## Activity` inline, the criterion below the quoted `## Notes` corrected, the fenced quote untouched, a forged `## Notes` declined and reported, the real note under its own section and the trail under `## Activity`. check 304/304, doctor 0/0.
