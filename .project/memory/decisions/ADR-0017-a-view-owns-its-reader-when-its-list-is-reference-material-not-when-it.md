---
id: ADR-0017
title: A view owns its reader when its list is reference material, not when it is a queue
status: superseded
related: [T-0197, T-0192]
tags: [ui]
created: 2026-08-05
updated: 2026-08-05
superseded_by: [ADR-0018]
---

## Context

`VIEW_OWNS_DRAWER` in `ui/src/navigation.ts` names one view: docs. Every other
view falls through to the shared drawer, which opens over whatever the reader was
looking at. The comment there explains the exception rather than the rule —
"docs owns a *reader*... the one view whose job is reading something long" — so
the only test it offers a future view is length, and length turns out to be the
wrong axis.

T-0197 asks whether history should join it. The argument is good: a changelog
fragment is short, but reading one usually means reading it against its
neighbours, and an overlay hides the list that gives it that context. The cost is
also real — a second pane, and the responsive story that goes with it, which is
the work that made docs the exception in the first place.

## Decision

**History keeps the overlay.** The rule is not how long the record is; it is what
the list is *for*.

A view owns its reader when its list is **reference material for the record** —
when the two are read together and the reader moves between them while working on
one thing. Docs qualifies: the outline and the document are one task, and the
list is a table of contents you return to.

A view keeps the overlay when its list is a **queue** — a set of records you work
through one at a time, where the list is how you got here rather than something
you consult while reading. History is a queue. So are explorer, memory, workflow
and a search result.

**And the complaint T-0197 makes is answered directly rather than by layout.**
The reason an overlay hurts a queue is that leaving one record to reach the next
means dismissing the reader, finding your place, and clicking again. The shared
drawer already solves that for cards: `Inspector` carries a previous/next cursor
fed by `orderedIds`, so a reader working through the explorer never needs the
table back. `RecordPanel` — every other kind: fragments, releases, decisions,
learnings, conventions, documents opened from elsewhere — has no cursor at all.

Giving it one costs no layout, needs no breakpoint, and fixes serial reading
everywhere at once instead of in the one view that filed the card.

## Consequences

The rule has to be written where the map is, because the next person adding a
view will read the comment and not this record.

A cursor over records needs an ordered list to move along, and `RecordPanel` is
reached from places that have no list — a `[[LRN-0004]]` inside a card body, a
related row, the command palette. The cursor is absent there rather than
guessed at: a next that means something different depending on how you arrived
is worse than no next.

This does not close the question forever. If history grows an editor the way
memory and docs have, its list becomes reference material for the thing being
edited and the rule flips it — which is the point of stating the rule instead of
the exception.

## Rejected

**A second pane in history.** It buys context the cursor buys more cheaply, and
costs a responsive story in the shortest rail in the application.

**Naming history in `VIEW_OWNS_DRAWER` without building the pane.** The map is
read by `drawerCovers` to decide whether to open at all, so an entry with nothing
behind it would make clicking a fragment do nothing.
