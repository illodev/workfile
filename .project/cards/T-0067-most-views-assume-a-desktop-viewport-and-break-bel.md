---
id: T-0067
title: Most views assume a desktop viewport and break below it
status: backlog
type: bug
priority: high
area: ui
tags: [ui-polish, responsive]
scope: [packages/workfile/ui/src/components/Memory.tsx, packages/workfile/ui/src/components/Docs.tsx, packages/workfile/ui/src/components/History.tsx, packages/workfile/ui/src/components/Health.tsx]
created: 2026-07-31
updated: 2026-07-31
---
Captured at 1440 / 1024 / 768 / 390 against the screenshot fixture. Below about
1024 the app stops being usable rather than merely tight:

- **Memory** lays fixed `w-[380px]` columns in a row; at 768 the second column
  is cut mid-badge and at 390 only one and a half columns are reachable. The
  toolbar's search input compresses to about 40px while the record count wraps
  and clips.
- **Docs** keeps its list and reader side by side at every width, so at 768
  each gets half of an already narrow pane.
- **History** and **Health** hold desktop table and tile geometry.

The sidebar occupies 240px at every width and never yields, which is most of
what makes 768 feel like 500.

## Scope

One pass with a shared approach: a breakpoint below which the sidebar collapses
to its icon rail or an overlay, list-plus-detail views become one column with a
back affordance, and fixed-width column strips become either a scroller with
honest affordances or a stack. `use-mobile.ts` already exists and is the natural
hook to key this off.

Related: [[T-0066]] covers the shell — header and footer — which fails the same
way and should land with it.
