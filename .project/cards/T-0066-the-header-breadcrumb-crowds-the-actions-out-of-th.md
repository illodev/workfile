---
id: T-0066
title: The header breadcrumb crowds the actions out of the bar
status: backlog
type: bug
priority: high
area: ui
tags: [ui-polish, responsive]
scope: [packages/workfile/ui/src/main.tsx]
created: 2026-07-31
updated: 2026-07-31
---

The app header is one flex row: sidebar trigger, breadcrumb, search button,
density toggle, theme toggle, New card. Below roughly 900px the breadcrumb
refuses to yield and the controls collide — at 390 the search button is a 40px
stub sitting on top of the breadcrumb text, and at 768 the breadcrumb overlaps
the search field outright.

The same row also carries the activity footer's problem: its badges overlap
each other into unreadable text at narrow widths.

## Scope

The breadcrumb is the least important thing in that bar and should be the first
to go. Below the breakpoint it can drop to the trailing segment alone, or leave
entirely; the search affordance and New card are what the header exists for.
The footer strip needs the same treatment — it should scroll, wrap or shed
badges rather than stack them on top of one another.
