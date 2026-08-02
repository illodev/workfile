---
id: T-0125
title: The bulk bar wears an accent edge and three button heights
status: done
type: bug
priority: low
area: ui
tags: [ui-polish]
scope: [packages/workfile/ui/src/components/domain/Explorer.tsx]
created: 2026-08-02
updated: 2026-08-02
---

Selecting rows in the Explorer raises the bulk bar, which is the one place in the app that decorates itself with a coloured edge: `border-l-2 border-l-primary`. Nothing else in the interface marks a container that way, and in dark mode the primary token is near-white, so the bar reads as a stripe of bare paper down its left side.

The controls inside it do not line up either. The three native selects are pinned to `h-[26px]` and the Apply/Clear pair are `size="sm"` buttons at 32px, so a row that is meant to read as one control strip steps up 6px in the middle.

## Acceptance criteria

- [x] The bulk bar carries no accent edge
- [x] Every control in the bar shares one height
- [x] The bar still reads as a distinct strip rather than dissolving into the table

## Activity

- 2026-08-02 18:07Z illodev@local#c0b2d745 · claimed
- 2026-08-02 18:08Z illodev@local#c0b2d745 · doing → review
- 2026-08-02 18:32Z illodev@local#c0b2d745 · review → done

## Findings

- 2026-08-02 18:32Z illodev@local#c0b2d745 — Verified with three rows selected: the five controls in the bar all measure 28px, and the left and right borders are both 1px — no accent edge.
