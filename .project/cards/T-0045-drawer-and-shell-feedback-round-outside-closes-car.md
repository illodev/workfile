---
id: T-0045
title: "Drawer and shell feedback round: outside closes, cards-only, collapsible sidebar"
status: done
type: task
priority: high
area: ui
created: 2026-07-31
updated: 2026-07-31
scope: [packages/workfile/ui/src/main.tsx, packages/workfile/ui/src/components/Inspector.tsx, packages/workfile/ui/src/components/domain/Explorer.tsx]
---
## Activity

- 2026-07-31 15:03Z claude-fable-4df73848 · claimed
- 2026-07-31 15:14Z claude-fable-4df73848 · doing → done
- 2026-07-31 15:14Z claude-fable-4df73848 · released

## Notes

- 2026-07-31 15:14Z claude-fable-4df73848 — Six-point feedback round on the drawer and shell, all runtime-verified against the served UI (smoke a-f):

(a) Non-card selections never raise the drawer: opening a changelog, memory or doc record from the palette or a view navigates there without the sheet appearing - the "opens in its view on the left" placeholder is unreachable. The Sheet's open condition gates on recordCollection(selectedId) === "cards" and the auto-open effect does the same.

(b) Clicking outside closes the drawer, as expected. The interesting defect lived here: Radix defers its pointer-down-outside dispatch until after click handlers run, so a record-opening click would open the drawer and then be dismissed ~12ms later by its own echo (instrumented with capture listeners: pointerdown 1942ms, click 1944ms opens, pointerDownOutside 1956ms closes). Fix: every record-open stamps lastSelectRef; the dismiss handlers ignore outside events arriving within 200ms of a selection. Covers rows, tiles and palette without marking each surface. The unsaved-input guard still blocks dismissal while editing.

(c) Row-to-row browsing keeps the drawer open (verified T-0045 to T-0037 swap).

(d) The topbar inspector toggle is gone along with its PanelRight import - the drawer opens by selecting and closes by X, Esc or clicking outside.

(e) The sidebar collapses to icon rail: collapsible="icon", SidebarTrigger at the topbar start, brand text/version chips and footer path hidden via group-data-[collapsible=icon]; the registry hides group labels and count badges itself. Verified 240px -> 48px -> 240px via both the trigger and Cmd/Ctrl+B (the provider shortcut that was inert under collapsible="none"), state persisted in the provider's cookie.

(f) The selected-row accent moved from the id cell to the first cell's left edge - the bar now starts where the row starts. Sidebar footer and app footer both measure exactly 32px (h-8).

check green after the round: 180 tests, 0 failures.
