---
id: T-0161
title: A card can be written with itself as its origin
status: done
type: bug
priority: low
area: core
effort: S
scope: [packages/workfile/src/modules/cards/validation.ts]
origin: [T-0156]
created: 2026-08-04
updated: 2026-08-07
verify:
  - id: self-reference
    run: [node, --test, packages/workfile/test/self-reference.test.ts]
    criteria: ["sha256:ae2edc316ff93cb65b575452945408f5f712ad33d6b5c7ed4fb61e9a5bb8af1b", "sha256:08de66f38da03ca41f2963e76624fc4140e4fd240792af7fbd1f8b826d7d38b9", "sha256:ee509c4d091e14ef3f3d6ec54722acb30bc019b2d2d5de59db82058afc24e497", "sha256:193e044572b952be47178266f43cdb70cc42ef043b03bdaff153cb343de4d96b"]
verified:
  at: "2026-08-07T21:43:04.036Z"
  method: ci
  commit: 5b61847f93bd6627f5062612f1f7d65b24f90e12
  run: "https://github.com/illodev/workfile/actions/runs/31220115910"
  digest: "sha256:f2995cfc1c6bad2b4ffb1aa5b08437eedb13148bf16918e93da009cad8069487"
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
- [x] `pnpm run check` green, doctor 0/0

## Activity

- 2026-08-07 21:19Z illodev@local#42eb42f5 · claimed
- 2026-08-07 21:24Z illodev@local#42eb42f5 · verify self-reference: node --test packages/workfile/test/self-reference.test.ts passed, checked #1, #2, #3, #4
- 2026-08-07 21:28Z runner@local · verify self-reference: node --test packages/workfile/test/self-reference.test.ts passed, checked #1, #2, #3, #4
- 2026-08-07 21:43Z illodev@local#42eb42f5 · released

## Notes

- 2026-08-07 21:43Z illodev@local#42eb42f5 — ci verification: Four of five criteria checked by the card's own declared command, run by CI on PR #36 and recorded in commit 5b61847 by the job that holds the write token. Criterion 5 is the gate: pnpm run check green at 477 + 10 tests, doctor 0/0. The card's premise was wrong and is corrected on the record: validateCardCandidate runs against id 'pending', so no self-reference check there can fire on a create, and a self parent is refused by CARD_PARENT_NOT_FOUND rather than by its own guard. The origin check therefore sits at the allocation, where the id exists, and a refused create writes no card and does not consume the id.
