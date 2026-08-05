---
id: T-0193
title: The inline filter strip cannot be dragged past its selects
status: backlog
type: bug
priority: medium
area: ui
effort: M
created: 2026-08-05
updated: 2026-08-05
related: [T-0194]
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

- [ ] A touch drag starting on a select scrolls the strip and does not open the select.
- [ ] A tap on a select still opens it.
- [ ] Workflow's kind and relation filters use the same scrollable strip.
- [ ] The strip is one shared component and the duplicated class lists are gone.

## Notes

- 2026-08-05 19:48Z illodev@local#bf4c5f67 — T-0195 landed a shared FilterSearch in the shell's filter strip, immediately after the view title and outside the horizontally-scrolling chip strip, and restructured the filter bars in Docs, History and Memory. The chip container's className was left byte-identical on purpose to keep this card's conflict small. Settle container ownership before starting: this card and T-0195 disagree about what the shared thing is — a scrollable chip strip, or a search row above the chips.
