---
id: T-0068
title: Overview rows and the board views still overflow on a phone
status: backlog
type: bug
priority: medium
area: ui
tags: [ui-polish, responsive]
scope: [packages/workfile/ui/src/components/domain/Overview.tsx, packages/workfile/ui/src/components/domain/Explorer.tsx, packages/workfile/ui/src/components/domain/Boards.tsx]
created: 2026-07-31
updated: 2026-07-31
---

[[T-0066]] and [[T-0067]] covered the shell and the four views they named. The
remaining surfaces were left out of that pass deliberately, and they still
assume a desktop viewport.

Captured at 390 after that work landed:

- **Overview** — the "what is left" rows put id, title and a trailing meta strip
  on one line. The strip runs past the edge: "never claime" is cut mid-word. The
  trail table below does the same. The tiles above are fine; they were fixed
  with the accent work.
- **Explorer** — an eight-column table at desktop geometry.
- **Flow / Epics / Timeline** — fixed 268px columns in a horizontal scroller.
  The scroller behaves, but the toolbars above it do not.

## Scope

The boards are the easy half: they already scroll horizontally, which is the
behaviour chosen for Memory, so they mostly need their toolbars to wrap.

Explorer is the one with no obvious answer. A table is a desktop form, and
turning eight columns into cards at 390 is a different view rather than a
narrower one — worth deciding before building. The `--card-density` work and
`useIsMobile` are both already available for it.
