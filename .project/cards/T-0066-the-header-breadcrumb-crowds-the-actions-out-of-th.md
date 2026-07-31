---
id: T-0066
title: The header breadcrumb crowds the actions out of the bar
status: done
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

## Activity

- 2026-07-31 22:16Z session-ui-polish · claimed
- 2026-07-31 22:17Z session-ui-polish · doing → done

## Verification

- 2026-07-31 22:16Z session-ui-polish — Header: the breadcrumb hides below lg — it repeats what the view header says one line down, so it is the cheapest thing in the bar to lose. The search button went from a fixed w-80 to `w-full max-w-80` so it shrinks instead of being overrun, the ⌘K hint drops below sm, and New card becomes an icon-only square below sm with its label kept as the accessible name. Footer: the claim ledger and the status badges were siblings in one row and neither yielded, which is why they drew over each other; the ledger is now its own container hidden below lg, badges stay. Runtime: screenshots at 390, 768, 1024 and 1440 — no overlap at any of them, and at 390 the header is trigger + full-width search + three controls.
