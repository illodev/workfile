---
id: T-0207
title: Only cards can be read in sequence; every other kind loses its place
status: done
type: feature
priority: medium
area: ui
tags: [navigation]
effort: S
scope: [packages/workfile/ui/src/components/RecordPanel.tsx, packages/workfile/ui/src/main.tsx]
origin: [ADR-0017, T-0197]
created: 2026-08-05
updated: 2026-08-07
verified:
  at: "2026-08-07T19:48:43.969Z"
  method: local
  commit: 94c9db17dcc2adea13b1e2e0f4d18e373136ee19
  digest: "sha256:6cb976fc73786d6336d6bc3ed17ae612bab13464996c1f937b92d6b3301e73e8"
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

- [x] Opening a record from a list lets the reader move to the next and previous in that list without closing the drawer.
- [x] The order matches what the view is showing, filters and sort included.
- [x] Opening a record from somewhere with no list shows no cursor rather than an arbitrary one.
- [x] The control is the one `Inspector` already uses, not a second one that looks like it.
- [x] The keyboard reaches it, and it does not capture keys the drawer already binds.

## Activity

- 2026-08-07 19:27Z illodev@local#42eb42f5 · claimed
- 2026-08-07 19:48Z illodev@local#42eb42f5 · released

## Notes

- 2026-08-07 19:45Z illodev@local#42eb42f5 — Two premises corrected while doing this, both from ADR-0018 landing after the card was written.

First, which panel serves what. The card says RecordPanel covers 'decisions, learnings, incidents, conventions and documents opened from outside the docs view'. It does not: memory records get MemoryPanel and documents get DocPanel, and RecordPanel is the fallback for changelog fragments and releases. The gap was real in all three, so the fix is a control every panel renders rather than one added to RecordPanel — which is also what the criterion asking for 'the one Inspector already uses' turns out to require.

Second, and larger: ADR-0018 gave docs and history their own readers, so the shared drawer no longer opens for either. The cursor had to go into those two panes as well or serial reading in history — the very complaint T-0197 filed — would still be broken with the card closed. Five call sites, one shared control, and the list published by whichever view was showing it.

And one thing the card claims that is not being delivered: Workflow gets no cursor. Its list is a force-directed layout, not an order, so next would mean whichever node the simulation happened to place — which is exactly what the card's own rule forbids. The graph opens records with no list behind it, deliberately.
- 2026-08-07 19:48Z illodev@local#42eb42f5 — local verification: Playwright against a live server on the repo workspace, 25 checks. Memory walks its lane order in the drawer and stops at the top; History walks its rail across the section break from unpublished into releases, and a state filter narrows the cursor with the list; Docs shows no cursor until a row is clicked, then steps; the workflow graph and a record opened by URL show none at all; the card cursor still walks the visible table. Keyboard: the control takes focus and steps on Enter, Escape still dismisses the drawer and Ctrl-K still opens the palette, so it binds nothing of its own. The rule is unit-tested through recordNeighbours and mutation-proven four ways, including a lookalike control added back to the inspector.
