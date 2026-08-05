---
id: T-0197
title: History answers a click with an overlay its own view could hold
status: backlog
type: idea
priority: low
area: ui
effort: M
created: 2026-08-05
updated: 2026-08-05
related: [T-0192]
---

Clicking a fragment in the history view opens the inspector drawer over it. This
is current behaviour rather than a defect: `VIEW_OWNS_DRAWER` (`main.tsx:311`)
names only `docs`, so every other view falls through to the overlay, and the
comment there explains why docs is special — it owns a *reader*, and a list you
opened a document from should not be covered by it.

The same argument applies to history. A changelog fragment is short, but reading
one usually means reading it against its neighbours, and an overlay hides the
list that gives it context.

Filed as an idea, not a bug, because it is a layout decision with a cost: the
history view would grow a second pane and the responsive story for it, which is
the work that made docs the exception in the first place. Worth deciding
deliberately rather than drifting into.

## Acceptance criteria

- [ ] A decision is recorded on whether history owns its reader or keeps the overlay.
- [ ] If it owns one, the list stays visible beside it above the mobile breakpoint.
- [ ] The reasoning in `VIEW_OWNS_DRAWER` is updated to describe the rule, not just the docs exception.
