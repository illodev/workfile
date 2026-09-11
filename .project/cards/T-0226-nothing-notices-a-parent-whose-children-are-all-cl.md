---
id: T-0226
title: Nothing notices a parent whose children are all closed
status: review
type: feature
priority: medium
area: core
raised: derived
created: 2026-09-02
updated: 2026-09-11
scope: [packages/workfile/src/modules/cards/cards.ts, packages/workfile/test, packages/workfile/docs/cli.md]
---

`diagnoseCards` validates every edge a card declares — `missing-parent`, `self-parent`,
`parent-cycle`, `hierarchy-depth`, `missing-dependency` — and every one of them looks **from the
child upwards**. Nothing ever looks down. There is no children index anywhere in the package:
`byId` exists for the upward walk in `hierarchyDepth`, and

```bash
grep -rn "children" packages/workfile/src --include=*.ts
```

returns only the `parent` filter of the MCP tool. So **a parent whose children are all closed stays
open forever and nothing says so**. `next` cannot cover it either: it drops epics by type.

## Why it matters

Nobody ever moves such a card, because nothing triggers it. It sits in `backlog` taking up room and
— the part that actually costs — **spending the context of whoever triages the board**, which from
now on is an agent almost every time.

## Measured on Fube, 2026-09-01, over 2 228 cards

52 cards have descendants; 38 of those are open; **2 of the 38 had no open descendant left**
(`T-0017`, `T-0203`). Three more — `T-2045` (68 children `done`), `T-0006`, `T-0021` — were in that
same state that morning and were moved to `review` by hand once a human looked.

## It must WARN, never `--fix`

Two opposite situations look identical from the count, and the measurement proves it:

- `T-2045`: 68 children `done`. Genuinely finished.
- `T-0017`: one child, `discarded`. But its body enumerates **four** work items and only one ever
  became a card. It is not finished — it is **undecomposed**. A naive rule would have closed it,
  asserting that work was done which was never even carded.

So transitioning is a decision, not a formatting repair. `doctor --fix` must not touch this.

## Three refinements the Fube prototype had to add, all measured

1. **Walk the subtree, not one level.** 6 cards are `done` with 13 open children; three of those
   hang under open parents. A one-level rule reports the cleanest-looking hit exactly when an open
   grandchild remains.
2. **`discarded` is not `delivered`.** Of 233 discarded cards, 187 carry a duplicate/superseded
   note, 183 name a concrete twin, and **125 of those twins are still open**, almost all under a
   different parent. The work moved; it did not get done.
3. **`updated` is not "someone judged this".** `patchFrontmatter` stamps it by default, so a machine
   touching a child moves it. The exact signal is the date of the **last entry under `## Notes`**.

## Measured again on 2026-09-11, over 2 550 cards, with the rule as shipped

Run through this package's doctor against the same board, `doctor --root ../fube-v2 --json`:
1 196 open cards, 58 parents, **2 findings**, the same two the Fube prototype prints that day
with the same twin data: T-0017 (`backlog`, 1 `discarded`, its note naming T-1062 and T-0847,
both still open, last note 2026-09-01) and T-0021 (`blocked`, 3 `done`, last note 2026-09-04).
0 near misses. On this repository: 0 findings — T-0183 has a child in `review` and one in
`backlog`.

## Acceptance criteria

- [x] `doctor` warns `parent-all-children-closed` on an open card whose every descendant is at rest, walking the whole subtree
- [x] A parent whose direct children are all at rest but with an open grandchild is not reported
- [x] A `discarded` child whose note names a still-open twin is reported as moved work, not counted as delivered
- [x] The finding carries the date of the parent's last note, not `updated`
- [x] `doctor --fix` does not act on it
- [x] The rule is measured against a real board before it ships and the result is recorded on this card

## Prior art

A local stand-in ships in the Fube repo as `scripts/backlog-parent-all-children-closed.mjs`, using
the same literal `parent-all-children-closed` so one grep finds both. Delete it when this check
lands.

## Activity

- 2026-09-11 16:27Z illodev@local#597ecdc9 · claimed
- 2026-09-11 16:38Z illodev@local#597ecdc9 · released

## Notes

- 2026-09-11 16:35Z illodev@local#597ecdc9 — Criterion 5 holds by construction, not by a test: doctor --fix dispatches exactly three repairs by name — the stale-filename reslug, duplicate IDs and misplaced trail entries (bin/workfile.ts, the --fix branch; its --dry-run payload lists the two it does not preview) — and never maps a finding code to a repair, so a new code cannot reach it. Criteria 1–4 are pinned by the cards.test.ts case 'doctor names an open parent whose whole subtree has come to rest' (stalled epic with a discarded child naming an open twin; near miss with an open grandchild; a parent already in review; a feature with review+deferred children). Criterion 6 is the 2026-09-11 run recorded in the body: 2 findings on 2 550 cards, identical to the Fube prototype's output that day, including the twin ids. Two things the prototype did not have and this one does: the actor in a note entry is optional (appendCardNote omits it when none resolved), and a '## Notes' heading at the very start of a body is found — the first draft searched for a newline before it and missed every parent whose body was nothing but notes.
