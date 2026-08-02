---
id: T-0122
title: The sidebar wears a blank square where the mark belongs
status: done
type: chore
priority: low
area: ui
tags: [ui-polish, brand]
scope: [packages/workfile/ui/src/main.tsx]
related: [T-0008]
created: 2026-08-02
updated: 2026-08-02
---

The sidebar header draws `<span className="size-4 rounded-sm bg-primary" />` — a placeholder square standing in for a logo the project already has. The mark exists and ships: it is the favicon in `ui/index.html` and the brand lockup on the landing (`site/index.html`), a rounded frame over three ruled lines.

The app is the only surface that does not use it, and it is the surface people spend hours in.

The colour discipline applies: `design-system.test.ts` fails on any colour literal in `ui/src`, so the mark strokes `currentColor` and takes its colour from a token like everything else.

## Acceptance criteria

- [x] The sidebar shows the Workfile mark, the same one the favicon and the landing use
- [x] It survives the collapsed icon rail, where it becomes the only thing left
- [x] No colour literal enters `ui/src`

## Activity

- 2026-08-02 18:13Z illodev@local#c0b2d745 · claimed
- 2026-08-02 18:13Z illodev@local#c0b2d745 · doing → review
- 2026-08-02 18:32Z illodev@local#c0b2d745 · review → done

