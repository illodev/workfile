---
id: T-0129
title: The timeline forgets its grouping on every navigation
status: done
type: task
priority: low
area: ui
scope: [packages/workfile/ui/src/components/domain/Boards.tsx]
related: [T-0104]
created: 2026-08-02
updated: 2026-08-04
origin: [T-0104]
---

Found while adding axis grouping ([[T-0104]]), and it predates that work — the
control never persisted anything.

`groupBy` is component state, `TimelineView` is lazy-loaded and only mounted
while the timeline is the current view, so navigating anywhere and back resets
the grouping to `none`. It is not in the URL either: `query.ts` reads and
writes view, record, card, q, status, area, type, priority, milestone, ideas
and closed, and no group key.

It mattered less when the options were `epic` and `area`. It matters more now
that a project can group by its own domain axis, because that is the reading
somebody sets up deliberately and then loses by clicking Docs.

The precedent is in the same file. `FlowBoard` keeps its collapsed columns in
`localStorage` under `workfile-flow-collapsed`, with the reason stated at
Boards.tsx:435-441: the preference belongs to the person, not the session. The
same argument applies here.

Worth deciding rather than assuming: `localStorage` makes it personal and
sticky, the URL makes it shareable — "look at the timeline by context" is a
link somebody might want to send. They are not exclusive, and the existing
filters already live in the URL.

## Acceptance criteria

- [x] A chosen grouping survives navigating away and back
- [x] A grouping naming an axis the project no longer declares falls back
      rather than leaving the chart grouped by nothing
- [x] Where it is kept is a recorded decision, since URL and localStorage
      answer different questions

## Activity

- 2026-08-02 19:22Z illodev@local#aed59c5e · claimed
- 2026-08-02 19:25Z illodev@local#aed59c5e · doing → done

## Notes

- 2026-08-02 19:25Z illodev@local#aed59c5e — Kept in `localStorage`, not the URL. The third criterion asks for the decision
on the record, so here it is.

The URL carries what you are looking at: the view, the open record, and the
filters in `query.ts` that decide which cards are on screen. Grouping decides
none of that — the code's own comment says it, "grouping only reorders: every
scheduled card stays on the chart". So a grouped timeline is not a different
thing to look at, and a shareable link to one would be a link to somebody's
preferences rather than to a view of the work.

That puts it with the flow board's collapsed columns forty lines up in the same
file, which states the rationale this borrows: the preference belongs to the
person, not the session. Storing it there also cost ten lines against roughly
four files for the URL route, since `Filters` is shared across views and a
timeline-only key does not belong in it — but the size was the tiebreak, not
the argument.

What would change the decision: if grouping ever selects as well as arranges —
a "show only this bucket" — it stops being presentation and belongs in the URL
with the other filters.

Verified in Chromium on a workspace declaring `context`:

    tras elegir:             group context
    tras ir a Docs y volver: group context
    tras recargar:           group context

And the second criterion, on a workspace declaring no axes at all, with
`context` already in storage from another project:

    el control muestra:   group none
    opciones ofrecidas:   ["none","epic","area"]

Storage being blocked outright is caught on both the read and the write: a
grouping is not worth a view that fails to mount, and the flow board's write is
unguarded today, which is worth knowing rather than copying.

234 + 7 tests pass, strict holds at baseline, the UI typechecks and builds.
