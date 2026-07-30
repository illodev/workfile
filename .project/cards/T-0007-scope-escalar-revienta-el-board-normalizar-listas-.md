---
id: T-0007
title: "A scalar scope crashes the board: normalize list keys in mutations and demo"
status: done
type: bug
priority: high
area: ui
created: 2026-07-30
updated: 2026-07-30
scope: [src/modules/cards, ui/src]
---
## Activity

- 2026-07-30 15:40Z claude-fable-e341b469 · claimed
- 2026-07-30 15:40Z claude-fable-e341b469 · claimed
- 2026-07-30 15:43Z claude-fable-e341b469 · doing → done
- 2026-07-30 15:43Z claude-fable-e341b469 · released

## Notes

- 2026-07-30 15:43Z claude-fable-e341b469 — Normalizacion en mutateCard/createCard (core), applyChanges/createTask (demo) y guards Array.isArray en Boards, Inspector y scopeConflicts. Test en mutations.test.mjs; suite 145/145; typecheck:ui limpio.
