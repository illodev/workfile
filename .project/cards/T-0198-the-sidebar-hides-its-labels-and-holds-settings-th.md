---
id: T-0198
title: The sidebar hides its labels and holds settings that are not its job
status: review
type: task
priority: low
area: ui
effort: S
created: 2026-08-05
updated: 2026-08-05
---

Two changes to the same surface.

Collapsed, the sidebar shows icons with no tooltip, so the only way to identify a
destination is to expand it again or click and find out. `components/ui/tooltip.tsx`
and `components/ui/sidebar.tsx` both exist; this is wiring, plus getting the
tooltips to stay out of the way when the sidebar is expanded.

The comfortable-rows toggle and the theme switch also live there. They are
settings, not navigation, and there will be more of them — verification policy
and update checks are both coming from other cards in this batch. A settings
dialog gives them somewhere to go that does not cost sidebar space.

## Acceptance criteria

- [x] Every collapsed sidebar item names itself on hover and on keyboard focus.
- [x] Tooltips do not appear when the sidebar is expanded and the label is already visible.
- [x] Row density and theme live in a settings dialog reachable from the shell.
- [x] Both settings still persist across reloads exactly as before.

## Notes

- 2026-08-05 20:31Z illodev@local#bf4c5f67 — Verified in a real browser: a collapsed rail names its destination on hover and on keyboard focus with the pointer parked away from it, an expanded rail raises nothing, and both settings persist across a reload (theme light to dark, density to comfortable). The Escape check is the one worth keeping: with a record open and the rail hovered, Escape still closes the record. That is why the implementation does not use SidebarMenuButton's tooltip prop, which both the plan and its critique had settled on — the prop renders the content in both states and only marks it hidden, and an open Radix tooltip is a dismissable layer whose capture-phase keydown handler calls preventDefault. The stock wiring would have taken Escape away from the shell whenever the pointer rested on an expanded rail.
- 2026-08-05 20:40Z illodev@local#bf4c5f67 — CI found what local could not: test/shell.test.ts read main.tsx as text and matched /function NavTooltip\([\s\S]*?\n}\n/, which finds nothing on a Windows checkout because the file is CRLF there. Both Node versions failed on windows-latest and every other platform passed, with the message 'NavTooltip is gone from main.tsx' about code sitting in the diff. Normalised in the read helper rather than per assertion, so the next regex added to that file inherits it. Recorded as LRN-0026.

## Activity

- 2026-08-05 20:31Z illodev@local#bf4c5f67 · backlog → review
