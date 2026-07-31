---
id: T-0063
title: CardHeader forces 24px of bottom padding onto compact headers
status: done
type: bug
priority: medium
area: ui
tags: [ui-polish, registry]
scope: [packages/workfile/ui/src/components/ui/card.tsx, packages/workfile/ui/src/components/Memory.tsx]
created: 2026-07-31
updated: 2026-07-31
---

`CardHeader` carries `[.border-b]:pb-6`, an arbitrary variant that compiles to a
two-class selector. Any header that also has `border-b` therefore gets 24px of
bottom padding that outranks the `py-2` written next to it — Memory's collection
heads (`Memory.tsx:1047`, `:1341`) ask for 8px and render 24.

The registry copy of `card.tsx` predates the `size` prop upstream shadcn now
ships (`size: "default" | "sm"`), which exists precisely to make a card compact
without fighting its own utilities.

## Scope

Bring the Card primitive up to the current registry shape — `size` on `Card`,
propagated to the parts through a data attribute — and use `size="sm"` where the
app wants a dense card, instead of overriding padding at each call site. Sweep
the other `border-b` headers for the same silent 24px.

## Activity

- 2026-07-31 21:46Z session-ui-polish · claimed
- 2026-07-31 21:53Z session-ui-polish · doing → done

## Verification

- 2026-07-31 21:53Z session-ui-polish — Adopted the current registry mechanism rather than only the `size` prop: Card declares `--card-spacing` and every part reads its padding from it (`px-(--card-spacing)`, `[.border-b]:pb-(--card-spacing)`), with `size="sm"` switching the variable from spacing(6) to spacing(4). Defaults are unchanged at 24px so no existing card moved. That variable is also the escape hatch the specificity problem needed — Memory's two collection heads set `[--card-spacing:--spacing(2)]` and their `py-2` now renders as 8px instead of 24. Swept the rest: Memory held the only two bordered CardHeaders, and History's CardFooter has no `border-t` so it never hit the `pt-6` twin. Runtime: screenshot at 1440 shows the gap under the header rule closed. 181 + 7 tests green, including the design-system suite.
