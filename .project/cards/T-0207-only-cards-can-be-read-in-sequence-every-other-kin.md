---
id: T-0207
title: Only cards can be read in sequence; every other kind loses its place
status: backlog
type: feature
priority: medium
area: ui
tags: [navigation]
effort: S
scope: [packages/workfile/ui/src/components/RecordPanel.tsx]
origin: [ADR-0017, T-0197]
created: 2026-08-05
updated: 2026-08-05
---

`Inspector` carries a previous/next cursor fed by `orderedIds`, so a reader
working through the explorer moves from card to card without dismissing the
drawer. `RecordPanel` — every other kind, which is changelog fragments,
releases, decisions, learnings, incidents, conventions and documents opened from
outside the docs view — has none. Reading three fragments in a row means
dismissing the drawer, finding your place in the list, and clicking again.

Per ADR-0017, this is the answer to what T-0197 was really complaining about. An
overlay over a queue hurts because leaving one record to reach the next is
expensive; it stops being expensive when the reader has a cursor. It costs no
layout and no breakpoint, and it fixes serial reading in history, memory,
workflow and search results at once rather than in the one view that noticed.

The list to move along is whatever the view was showing, the same way
`orderedIds` already works — the filtered, sorted list, not the whole corpus, or
the cursor disagrees with what the reader can see.

The cursor must be absent, not guessed, where there is no list: a `[[LRN-0004]]`
inside a card body, a `related` row, the command palette. A next that means
something different depending on how you arrived is worse than no next.

## Acceptance criteria

- [ ] Opening a record from a list lets the reader move to the next and previous in that list without closing the drawer.
- [ ] The order matches what the view is showing, filters and sort included.
- [ ] Opening a record from somewhere with no list shows no cursor rather than an arbitrary one.
- [ ] The control is the one `Inspector` already uses, not a second one that looks like it.
- [ ] The keyboard reaches it, and it does not capture keys the drawer already binds.
