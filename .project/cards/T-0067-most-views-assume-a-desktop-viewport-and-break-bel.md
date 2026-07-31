---
id: T-0067
title: Most views assume a desktop viewport and break below it
status: done
type: bug
priority: high
area: ui
tags: [ui-polish, responsive]
scope: [packages/workfile/ui/src/components/Memory.tsx, packages/workfile/ui/src/components/Docs.tsx, packages/workfile/ui/src/components/History.tsx, packages/workfile/ui/src/components/Health.tsx, packages/workfile/ui/src/layout.ts]
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

## Activity

- 2026-07-31 22:16Z session-ui-polish · claimed
- 2026-07-31 22:17Z session-ui-polish · doing → done

## Verification

- 2026-07-31 22:16Z session-ui-polish — Memory, Docs and History collapse to one pane below lg with a Back control; Memory's lanes stay a horizontal scroller at every width, per the decision, and its toolbar wraps instead of compressing the search field to 40px. Health's tiles and issue rows wrap. Runtime: screenshots at 390, 768, 1024, 1440. 181 + 7 tests green.

The breakpoint moved from md to lg during the work, and the reason is worth keeping: 768 is the worst width in the app, not a safe one. The registry sidebar's overlay mode starts *below* 768, so at exactly 768 it still holds 240px and a split pane got about 260px a side — the Docs title wrapped over three lines. Two thresholds are therefore deliberate: the sidebar yields at 768 because that is the registry's contract, the views at 1024 because that is where they stop fitting.

Out of scope by agreement and filed as [[T-0068]]: Overview's list rows still run past the edge at 390, and Explorer and the three boards keep desktop geometry.
