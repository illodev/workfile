---
id: T-0202
title: The demo backend and the server disagree about what a search matches
status: backlog
type: bug
priority: low
area: search
tags: [demo]
effort: S
scope: [packages/workfile/ui/src/api.demo.ts]
origin: [T-0195]
created: 2026-08-05
updated: 2026-08-05
---

`searchScore` in `src/modules/records/index.ts` indexes a record body as whole
tokens and falls back to substring only on the title. `matches()` in
`ui/src/api.demo.ts` is a case-insensitive `includes` over title, body, path and
id. So a partial word finds a body in the hosted demo and finds nothing against a
real workspace.

The direction is the safe one — the demo matches more, so nothing silently fails
there — but the demo is what most readers see first, and T-0195 had to write a
placeholder that is exactly true of the server and merely understated for the
demo. A promise the interface makes should be true of both things behind it.

Cheapest fix is to tokenize in the demo adapter rather than to loosen the server:
the server's whole-token body index is what keeps the search fast over a real
corpus, and that is a measured decision recorded in `query.ts`.

## Acceptance criteria

- [ ] The demo adapter and the server agree on what a query matches, field by field.
- [ ] The placeholder T-0195 wrote is exactly true against both.
- [ ] A test compares the two implementations over the same fixture rather than asserting each separately.
