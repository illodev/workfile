---
id: T-0193
title: The inline filter strip cannot be dragged past its selects
status: done
type: bug
priority: medium
area: ui
effort: M
created: 2026-08-05
updated: 2026-08-05
related: [T-0194]
verified:
  at: "2026-08-05T23:50:18.156Z"
  method: local
  commit: 434317ee8b3ab53824bc319fcf210df6ce36c2ac
  digest: "sha256:7f39fe3560ccd74d11a20911eb65277d44c2c19824cb3b3b46c4f7974802513b"
---

The filter strips are horizontally scrollable by design — `main.tsx:1425` carries
`no-scrollbar -mx-3 overflow-x-auto`, and the comment above it records that chips
used to wrap into three stacked rows. On touch, a drag that starts on a select
trigger is swallowed by the trigger instead of scrolling the strip, so the strip
can only be moved from the gaps between controls.

The usual cause is the trigger consuming `pointerdown`, which is what most
select primitives do to open on press. The fix is at the strip level rather than
per control: `touch-action` on the scroller, or opening on click rather than
pointerdown so a drag stays a drag.

The Workflow view's own filters (kinds and relations — cards, memory, docs,
changes, releases, parent) never got the inline strip treatment at all and still
wrap. They want the same container, so this card covers both: the strip pattern
should be one component, not a class list copied per view.

## Acceptance criteria

- [x] A touch drag starting on a select scrolls the strip and does not open the select.
- [x] A tap on a select still opens it.
- [x] Workflow's kind and relation filters use the same scrollable strip.
- [x] The strip is one shared component and the duplicated class lists are gone.

## Notes

- 2026-08-05 19:48Z illodev@local#bf4c5f67 — T-0195 landed a shared FilterSearch in the shell's filter strip, immediately after the view title and outside the horizontally-scrolling chip strip, and restructured the filter bars in Docs, History and Memory. The chip container's className was left byte-identical on purpose to keep this card's conflict small. Settle container ownership before starting: this card and T-0195 disagree about what the shared thing is — a scrollable chip strip, or a search row above the chips.
- 2026-08-05 22:54Z illodev@local#bf4c5f67 — Verified with real touch input, not synthetic events — my first probe dispatched TouchEvent objects and measured scrollLeft 0, which proves nothing: the compositor does not pan for synthetic events. Redone through CDP Input.dispatchTouchEvent at 390x844 with touch emulation. Dragging 170px from the dead centre of the status chip: explorer scrolled 174px of the 174 available and no menu opened; workflow scrolled 172 of 174, same. A tap on the same chip opens the menu in both. Workflow's kind and relation row (Cards, Memory, Docs, Changes, Releases, then a pinned Fit) is now in the strip it never had, confirmed in a screenshot at 390px.
- 2026-08-05 23:50Z illodev@local#bf4c5f67 — local verification: Built UI at 390px with CDP Input.dispatchTouchEvent (a synthetic TouchEvent does not drive the compositor, LRN from T-0193): a touch drag across the filter strip moved scrollLeft from 0 to 174 of the 174px available, in Explorer and in Workflow, with no menu open at the end. A tap on the same chip opened its menu.

## Activity

- 2026-08-05 23:09Z illodev@local#bf4c5f67 · backlog → review
- 2026-08-05 23:50Z illodev@local#bf4c5f67 · review → done
