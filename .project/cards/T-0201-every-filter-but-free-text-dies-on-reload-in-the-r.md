---
id: T-0201
title: Every filter but free text dies on reload in the record views
status: done
type: bug
priority: medium
area: ui
tags: [filters]
effort: S
scope: [packages/workfile/ui/src]
origin: [T-0195]
created: 2026-08-05
updated: 2026-08-07
verified:
  at: "2026-08-07T19:27:25.363Z"
  method: local
  commit: 94c9db17dcc2adea13b1e2e0f4d18e373136ee19
  digest: "sha256:f03dcd31b0af609f8e57ea210b9d8e85af6dbd9e11dbb197b4757df42bf70c1e"
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

- [x] Docs, history and memory restore every filter they offer after a reload.
- [x] They survive a view switch and a return, the way the work views' filters do.
- [x] The parameter names are decided in one place, next to `q` and `find`.
- [x] Clearing a filter removes its parameter rather than leaving it empty in the URL.
- [x] A test covers the round trip for each view.

## Activity

- 2026-08-07 19:09Z illodev@local#42eb42f5 · claimed
- 2026-08-07 19:27Z illodev@local#42eb42f5 · released

## Notes

- 2026-08-07 19:27Z illodev@local#42eb42f5 — local verification: Playwright against a live server on the repo workspace, 24 checks: Memory narrowed 55 to 32 records and kept it across a reload, a switch to Explorer and back; History 171 rows to 2 with state and visibility both restored; the docs indexed group gone with the toggle still pressed after a reload; Back walked the narrowings. The guard was mutation-proven five ways, including the parameter-name clash with the card status filter.
