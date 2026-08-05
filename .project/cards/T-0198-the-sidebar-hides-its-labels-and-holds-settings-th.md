---
id: T-0198
title: The sidebar hides its labels and holds settings that are not its job
status: backlog
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

- [ ] Every collapsed sidebar item names itself on hover and on keyboard focus.
- [ ] Tooltips do not appear when the sidebar is expanded and the label is already visible.
- [ ] Row density and theme live in a settings dialog reachable from the shell.
- [ ] Both settings still persist across reloads exactly as before.
