---
id: T-0041
title: "The Inspector becomes an overlay drawer: expandable, denser body type"
status: done
type: feature
priority: high
area: ui
created: 2026-07-31
updated: 2026-07-31
scope: [packages/workfile/ui/src/main.tsx, packages/workfile/ui/src/components/Inspector.tsx]
---
## Intent

Three of the owner's wishes, one surface. The Inspector today is a fixed right rail: it steals layout width from every view, its drag-resizer is fiddly, and its rendered Markdown body reads too large. It becomes a right-side overlay **drawer** (registry Sheet, `modal={false}`): the board never reflows, row-to-row browsing keeps working while it is open, outside clicks do not close it, and Esc still respects the unsaved-input guard.

The resizer dies in favour of two states — normal (~480px) and **expanded** (~min(1100px, 92vw)) via a maximize toggle — both persisted. Inside, the typeset scale drops to ~13px body with a capped readable measure in the expanded width; property grids may use the full width.

## Acceptance

- Main content width is identical with the drawer open or closed.
- Clicking another row while open swaps content without closing; Esc closes unless a form holds unsaved input.
- Expanded state survives reload. No drag-resizer remains.
- Inspector body text lands ~13px; expanded view caps line measure (~72ch) for prose while tables stretch.

Wishes: drawer (1), body type (6), expand (7).

## Activity

- 2026-07-31 14:53Z claude-fable-4df73848 · doing → done
- 2026-07-31 14:53Z claude-fable-4df73848 · released

## Notes

- 2026-07-31 14:53Z claude-fable-4df73848 — Implemented and runtime-verified. The rail is a non-modal Sheet drawer composed from the sheet primitives directly (the registry SheetContent's portal ignores forceMount, and the drawer must stay mounted while closed so an open form survives a toggle). Integration fix on top of the agent's work: open requires BOTH the preference and a selection - the old rail could sit empty in-flow, but an empty overlay was dead glass covering the toolbar on a fresh load, which the first runtime smoke caught by failing to click through it. Typography: the body wrapper overrides the typeset knobs at the element level (--typeset-size 0.8125rem, leading 1.6, 72ch measure capped for prose, full width for .typeset-scroll tables) - the utilities layer outranks typeset.css's components layer, and the placement on .typeset itself is load-bearing (an inherited value would lose to the element's own declaration).

Runtime evidence, 8/8 smoke against the served UI: clean load keeps the drawer closed; opening causes zero reflow (table 1156px before and after); clicking another row swaps content without closing (T-0041 to T-0037); expand reaches 1100px and persists under workfile-inspector-expanded; Esc closes respecting the editingRef guard; body lands at 13px desktop. check green (180 tests).

Known deltas, accepted: the fixed drawer covers the topbar's right buttons while open (inherent to overlay); close is instant while open animates (forceMount); the slim drawer control strip sits above the Inspector's own header - cosmetic, revisit if it grates. Pre-existing quirk unchanged: the document-level Escape handler ignores defaultPrevented, so Esc with the palette open also clears the selection.
