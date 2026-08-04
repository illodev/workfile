---
id: T-0157
title: card write silently drops everything below a protocol heading
status: backlog
type: bug
priority: medium
area: core
created: 2026-08-04
updated: 2026-08-04
origin: [T-0155]
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

## Discovered by

Authoring [[T-0155]] with a `## Notes` section above its acceptance criteria,
then correcting a wrong card reference in it. The first `card write` fixed the
prose and left the criterion pointing at the wrong card; the second appended a
duplicate of the whole tail. The card was repaired by editing the file, which
is safe here only because `revision` is derived from content rather than
stored. There is no CLI path back from that state.

## Acceptance criteria

- [ ] The chosen option is recorded as a decision before it is built
- [ ] A body write either applies fully or fails naming what it could not write
- [ ] The repro above passes under the new behaviour
- [ ] A card already in this shape is reachable — repaired or reported
- [ ] `pnpm run check` green, doctor 0/0
