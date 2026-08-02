---
id: T-0124
title: A Flow column cannot be collapsed to get out of the way
status: done
type: feature
priority: medium
area: ui
tags: [ui-polish]
scope: [packages/workfile/ui/src/components/domain/Boards.tsx]
created: 2026-08-02
updated: 2026-08-02
---

Flow draws six columns at 268px each, eight with closed states shown. That is 1,650px before gaps, so on a laptop the board always scrolls sideways and the columns that matter — `doing`, `review` — are rarely both on screen at once. Every column is worth exactly as much width as every other, whether it holds forty cards or none.

Every kanban that survives contact with a real board answers this the same way: collapse a column to a strip, keep its name and its count readable, and let it come back with one click. It is not hiding — the count is the point, and the strip stays a drop target.

The preference belongs to the person, not the session: a column collapsed today is still collapsed tomorrow, like the density and inspector toggles beside it.

## Acceptance criteria

- [x] A column collapses to a narrow strip and expands again from the strip
- [x] Collapsed, it still shows its status and its card count
- [x] A card can still be dropped on a collapsed column
- [x] The keyboard move path still reaches every column, collapsed or not
- [x] The choice survives a reload

## Activity

- 2026-08-02 18:08Z illodev@local#c0b2d745 · claimed
- 2026-08-02 18:13Z illodev@local#c0b2d745 · doing → review
- 2026-08-02 18:32Z illodev@local#c0b2d745 · review → done

## Findings

- 2026-08-02 18:32Z illodev@local#c0b2d745 — Verified: backlog collapses 268px → 44px, keeps its count, survives a reload, and expands again. The collapsed strip is still a drop target and still a stop on the keyboard move path, because the drag handlers and the status list sit above the collapsed/expanded branch.
