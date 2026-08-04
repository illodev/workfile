---
id: T-0161
title: A card can be written with itself as its origin
status: backlog
type: bug
priority: low
area: core
effort: S
scope: [packages/workfile/src/modules/cards/validation.ts]
origin: [T-0156]
created: 2026-08-04
updated: 2026-08-04
---

Found in the 0.6.0 smoke test, against the published package. On a fresh
workspace:

```
workfile card create --title "Came out of the release" --origin T-0001
```

The card is allocated `T-0001` and written with `origin: [T-0001]`. Exit 0.
`doctor` then reports `ERROR self-origin T-0001: Card cannot originate from
itself`, which is the rule working — but working one step too late.

## Why it is a gap and not a preference

The other two relationship fields refuse this at write time *and* have a doctor
rule:

| Field | Write-time | doctor |
|---|---|---|
| `parent` | `CARD_SELF_PARENT` | `self-parent` |
| `depends` | `CARD_SELF_DEPENDENCY` | `self-dependency` |
| `origin` | **nothing** | `self-origin` |

So the repository can be put into a state `doctor` calls an error by a command
that reported success, which is the shape the write-time guards exist to
prevent. The pre-commit hook runs `doctor --severity error`, so the next commit
is refused — a defect discovered at commit time by a card written minutes
earlier, with nothing to say which command wrote it.

## The fix

One branch in `validateCardCandidate`, alongside the two that are already
there. `candidate.id` is set by the time it runs — that is how the existing
self-parent check catches the same case on creation rather than only on patch.

The `missing-origin` half stays where it is. That one genuinely cannot be
checked at write time for the general case, because an origin may name a record
that does not exist yet.

## Acceptance criteria

- [ ] `card create --origin` naming the ID being allocated is refused
- [ ] `card patch` setting a card's own ID as its origin is refused
- [ ] The error code reads like its two neighbours
- [ ] The doctor rule stays, for records written before this landed
- [ ] `pnpm run check` green, doctor 0/0
