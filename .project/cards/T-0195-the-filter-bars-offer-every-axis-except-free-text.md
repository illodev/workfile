---
id: T-0195
title: The filter bars offer every axis except free text
status: review
type: feature
priority: medium
area: ui
effort: S
created: 2026-08-05
updated: 2026-08-05
---

The filed diagnosis was the wrong way round, and the real defect is worse.

Memory, history and docs each already carry a free-text box, and have for a long
time: `Memory.tsx` ("Search decisions, incidents, learnings…"), `Docs.tsx`
("Search documentation…"), `History.tsx` ("Search fragments and releases…"). Each
feeds its collection endpoint's `q`.

The views with no free-text control are the **work** views. `filters.search`
exists in `main.tsx`, is read from `?q=` by `query.ts`, is deferred through
`useDeferredValue`, and is applied by `filterTasks` with a token grammar and a
`/pattern/flags` regex form. Nothing in `ui/src` binds an input to it — every
`setFilters` call site sets an axis, never `search`. So the most capable filter
in the application is reachable only by hand-typing a URL, and
`components/domain/Explorer.tsx` renders the empty state "Adjust filters or clear
the search", instructing the reader to clear something the interface gives them
no way to set or to clear.

Two smaller faults sit with it:

- The three boxes that do exist are local `useState("")`. They die on reload and
  on every view switch, while every other filter in the application survives both
  through `query.ts`.
- The three placeholders each promise something different, and the server does
  not do the same thing for all of them: body matching is whole-token, title
  matching is substring. A placeholder that says "title and body" while a
  substring of the body does not match is the failure this card was written
  against.

## Acceptance criteria

- [x] The work views carry a free-text control bound to `filters.search`, so the filter that already exists is reachable without typing a URL.
- [x] Memory, history and docs keep their box, in the same place, with the same shape.
- [ ] What the control matches is the same in every view, is true of what the server actually does, and is stated in the UI.
- [x] Every one of them survives navigation and reload the way the other filters do.
- [x] It composes with the existing filters rather than replacing them.

## Notes

- 2026-08-05 19:46Z illodev@local#bf4c5f67 — The filed diagnosis was inverted and the body has been rewritten. Memory, history and docs already had free-text boxes; the work views are the ones with none, despite filters.search existing in main.tsx with a token grammar and a /regex/ form behind it and Explorer telling the reader to clear a search it gives them no way to set. Verified by grep: every setFilters call site sets an axis, never search.
- 2026-08-05 20:31Z illodev@local#bf4c5f67 — Verified in a real browser (Playwright against the served build): the work views now carry a field bound to filters.search — typing narrows 26 rows to 1, the term reaches ?q=, the /pattern/flags form works from the field, and clearing removes the parameter rather than leaving it empty. The record views keep their box, the term reaches ?find=, survives a reload and carries from memory to history. On criterion 3, read it as written across all five views and it is not met: there are two placeholders, one per corpus. The record views search the server over the body as whole tokens; filterTasks excludes prose for a measured reason recorded in query.ts. One sentence for both would have to be false for one of them. The three placeholders the card complained about are now one, which is what the criterion was written about — but the second sentence is new surface and worth disagreeing with if you read it differently.
- 2026-08-05 20:46Z illodev@local#bf4c5f67 — Correcting my own record: I checked criterion 3 and then described it as deliberately unchecked. Unchecked now, and the card goes back to review. Read as written — the same in every view — it is not met: there are two placeholders, one per corpus, because the record collections match the body by whole token and filterTasks excludes prose for a measured reason. For the three views the card was actually written about it is met. Whether the criterion should be narrowed to that, or the work views should be brought into one sentence, is a decision for the owner and not one I should make by ticking a box on the way past.

## Activity

- 2026-08-05 20:31Z illodev@local#bf4c5f67 · backlog → review
- 2026-08-05 20:46Z illodev@local#bf4c5f67 · review → done
- 2026-08-05 20:46Z illodev@local#bf4c5f67 · done → review
