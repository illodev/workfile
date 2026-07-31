---
id: T-0062
title: Colour accents ride the border, so rounded corners bend them
status: done
type: bug
priority: medium
area: ui
tags: [ui-polish]
scope: [packages/workfile/ui/src/components/domain/Overview.tsx, packages/workfile/ui/src/components/domain/Boards.tsx, packages/workfile/ui/src/components/Health.tsx]
created: 2026-07-31
updated: 2026-07-31
---

Three surfaces carry their status colour on a container border, and the border
follows the corner radius, so the accent curves away into the rounding instead
of reading as a straight marker.

- `domain/Overview.tsx:512` — the stat tiles use `border-l-2` with
  `borderLeftColor`, on a `rounded-xl` Card.
- `Health.tsx:183` — the same tile treatment, same problem.
- `domain/Boards.tsx:225` — the column heads invert it: `border-t-2` with
  `rounded-b-lg rounded-t-none`, so the top is square but the accent still
  terminates on the rounded flanks below.

Keep the colour, take it off the border. The accent should be a shape the
component owns — an inset bar that does not inherit the radius — so the
container can stay rounded on all four corners without bending the marker.

## Scope

One treatment for all three, since the inconsistency between the tiles and the
board heads is itself part of what looks wrong. `design-system.test.ts` forbids
colour literals in components, so the accent has to keep reading its colour from
the same token/prop it does today.

## Activity

- 2026-07-31 21:46Z session-ui-polish · claimed
- 2026-07-31 21:53Z session-ui-polish · doing → done

## Verification

- 2026-07-31 21:53Z session-ui-polish — One `Accent` component in components/Accent.tsx serves all three, with an `edge` prop for the two orientations, so the treatment cannot drift again. It renders an inset bar — square ends, stopped short of the corners — and still takes its colour as a prop, so statusColor/severityColor stay the only deciders and the no-colour-literals rule holds. The board columns got their top corners back: they had been squared only to hide the bent border, which left them rounded at one end. Runtime: screenshots at 1440 of overview, health and flow show straight accents on fully rounded containers.
