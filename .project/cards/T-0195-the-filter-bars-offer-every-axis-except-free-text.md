---
id: T-0195
title: The filter bars offer every axis except free text
status: done
type: feature
priority: medium
area: ui
effort: S
created: 2026-08-05
updated: 2026-08-07
verified:
  at: "2026-08-07T20:35:06.643Z"
  method: local
  commit: 61512e4dce848b0646b87f3c438a55f996a9b1d5
  digest: "sha256:a6ee64843c4d82dedf96fa02a9d048e7c3b07f722102fb784bf1cd4e10ba2bea"
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
- [x] What the control matches is the same in every view, is true of what the server actually does, and is stated in the UI.
- [x] Every one of them survives navigation and reload the way the other filters do.
- [x] It composes with the existing filters rather than replacing them.

## Notes

- 2026-08-05 19:46Z illodev@local#bf4c5f67 — The filed diagnosis was inverted and the body has been rewritten. Memory, history and docs already had free-text boxes; the work views are the ones with none, despite filters.search existing in main.tsx with a token grammar and a /regex/ form behind it and Explorer telling the reader to clear a search it gives them no way to set. Verified by grep: every setFilters call site sets an axis, never search.
- 2026-08-05 20:31Z illodev@local#bf4c5f67 — Verified in a real browser (Playwright against the served build): the work views now carry a field bound to filters.search — typing narrows 26 rows to 1, the term reaches ?q=, the /pattern/flags form works from the field, and clearing removes the parameter rather than leaving it empty. The record views keep their box, the term reaches ?find=, survives a reload and carries from memory to history. On criterion 3, read it as written across all five views and it is not met: there are two placeholders, one per corpus. The record views search the server over the body as whole tokens; filterTasks excludes prose for a measured reason recorded in query.ts. One sentence for both would have to be false for one of them. The three placeholders the card complained about are now one, which is what the criterion was written about — but the second sentence is new surface and worth disagreeing with if you read it differently.
- 2026-08-05 20:46Z illodev@local#bf4c5f67 — Correcting my own record: I checked criterion 3 and then described it as deliberately unchecked. Unchecked now, and the card goes back to review. Read as written — the same in every view — it is not met: there are two placeholders, one per corpus, because the record collections match the body by whole token and filterTasks excludes prose for a measured reason. For the three views the card was actually written about it is met. Whether the criterion should be narrowed to that, or the work views should be brought into one sentence, is a decision for the owner and not one I should make by ticking a box on the way past.
- 2026-08-05 23:50Z illodev@local#bf4c5f67 — Held in review for the release cut of 0.7.0. Criterion 3 is the one that is not met: what the control matches differs between the server and the demo backend, which is T-0202, and until that is one answer the UI cannot state it truthfully. The other four are proven and shipped.
- 2026-08-07 20:34Z illodev@local#42eb42f5 — Criterion 3 resolved by the owner: one sentence per corpus is what the criterion asks for. The defect it was written against was three placeholders promising three different things for the same corpus; there is one per corpus now, each true of the backend behind it, and both are written in FilterSearch.tsx so a fourth view cannot invent a third promise without deleting one of them.

The blocker is also gone. T-0202 was what made the record sentence true of only one of the two backends: the demo answered a query by substring and its palette by a third rule again. Both run the server's rule now, filters and negation included, with a parity test over one fixture.

Verified in a browser against a live server: the work views state 'Search id, title and tags' and each of the three finds cards, while a body-only word finds none by default and body: reaches the prose — which is the measured decision in query.ts, not an omission. The record views state 'Search title and body, whole words', and the server's whole-token body rule is what that sentence describes.

Both placeholders under-promise rather than overpromise: the record search also matches identity and metadata, and the card filter also matches source, parent and milestone. The sentences name the floor, and the surprising part of the floor is the whole-word body rule, which is the one a reader hits first.
- 2026-08-07 20:35Z illodev@local#42eb42f5 — local verification: Criterion 3 was the only one open and the owner resolved the reading: one sentence per corpus is what it asks for, and the defect was three sentences for one corpus. Its blocker T-0202 is closed, so the record sentence is now true of both backends rather than of the server alone. Verified in Chromium against a live server: the work views' field carries 'Search id, title and tags' and an id, a tag and a title phrase each find cards, while a body-only word finds none by default and body: reaches the prose — the measured decision recorded in query.ts. The record views carry 'Search title and body, whole words', which is the server's whole-token body rule, and the demo now answers it identically. The other four criteria were proven and shipped in 0.7.0. Full gate green: 471 + 10 tests.

## Activity

- 2026-08-05 20:31Z illodev@local#bf4c5f67 · backlog → review
- 2026-08-05 20:46Z illodev@local#bf4c5f67 · review → done
- 2026-08-05 20:46Z illodev@local#bf4c5f67 · done → review
- 2026-08-07 20:35Z illodev@local#42eb42f5 · released
