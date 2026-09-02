---
id: T-0226
title: Nothing notices a parent whose children are all closed
status: backlog
type: feature
priority: medium
area: core
raised: derived
created: 2026-09-02
updated: 2026-09-02
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

## Prior art

A local stand-in ships in the Fube repo as `scripts/backlog-parent-all-children-closed.mjs`, using
the same literal `parent-all-children-closed` so one grep finds both. Delete it when this check
lands.
