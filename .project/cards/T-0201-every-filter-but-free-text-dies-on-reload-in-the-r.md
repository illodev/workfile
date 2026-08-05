---
id: T-0201
title: Every filter but free text dies on reload in the record views
status: backlog
type: bug
priority: medium
area: ui
tags: [filters]
effort: S
scope: [packages/workfile/ui/src]
origin: [T-0195]
created: 2026-08-05
updated: 2026-08-05
---

T-0195 moved the three free-text boxes off local `useState` and into the URL, the
way the work views' axis filters already worked. It left the axis filters of those
same three views where they were.

Docs still holds `managedOnly` locally. History holds `state` and `visibility`.
Memory holds `collection` and `status`. All five die on reload and on every view
switch, so a reader who narrows Memory to open incidents, opens a card to check
something and comes back gets the unfiltered list — and nothing about the
interface says the narrowing was ever there.

The mechanism already exists and is one card old: the shell owns the value,
`query.ts` serialises it, `readUrlState` restores it, the popstate handler applies
it. Free text went through it; these did not, because the card that moved it was
about free text.

Worth doing as one pass for the same reason T-0195 was: five filters landing in
the URL one view at a time is five chances to name the parameter differently.

## Acceptance criteria

- [ ] Docs, history and memory restore every filter they offer after a reload.
- [ ] They survive a view switch and a return, the way the work views' filters do.
- [ ] The parameter names are decided in one place, next to `q` and `find`.
- [ ] Clearing a filter removes its parameter rather than leaving it empty in the URL.
- [ ] A test covers the round trip for each view.
