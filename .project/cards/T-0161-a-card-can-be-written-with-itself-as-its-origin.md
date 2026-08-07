---
id: T-0161
title: A card can be written with itself as its origin
status: doing
type: bug
priority: low
area: core
effort: S
scope: [packages/workfile/src/modules/cards/validation.ts]
origin: [T-0156]
created: 2026-08-04
updated: 2026-08-07
claimed_by: "illodev@local#42eb42f5"
claimed_at: "2026-08-07T21:19:17.046Z"
verify:
  - id: self-reference
    run: [node, --test, packages/workfile/test/self-reference.test.ts]
    criteria: ["sha256:ae2edc316ff93cb65b575452945408f5f712ad33d6b5c7ed4fb61e9a5bb8af1b", "sha256:08de66f38da03ca41f2963e76624fc4140e4fd240792af7fbd1f8b826d7d38b9", "sha256:ee509c4d091e14ef3f3d6ec54722acb30bc019b2d2d5de59db82058afc24e497", "sha256:193e044572b952be47178266f43cdb70cc42ef043b03bdaff153cb343de4d96b"]
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

- [x] `card create --origin` naming the ID being allocated is refused
- [x] `card patch` setting a card's own ID as its origin is refused
- [x] The error code reads like its two neighbours
- [x] The doctor rule stays, for records written before this landed
- [ ] `pnpm run check` green, doctor 0/0

## Activity

- 2026-08-07 21:19Z illodev@local#42eb42f5 · claimed
- 2026-08-07 21:24Z illodev@local#42eb42f5 · verify self-reference: node --test packages/workfile/test/self-reference.test.ts passed, checked #1, #2, #3, #4
- 2026-08-07 21:28Z runner@local · verify self-reference: node --test packages/workfile/test/self-reference.test.ts passed, checked #1, #2, #3, #4
