---
id: T-0202
title: The demo backend and the server disagree about what a search matches
status: done
type: bug
priority: low
area: search
tags: [demo]
effort: S
scope: [packages/workfile/ui/src/api.demo.ts]
origin: [T-0195]
created: 2026-08-05
updated: 2026-08-07
verified:
  at: "2026-08-07T20:30:23.731Z"
  method: local
  commit: 61512e4dce848b0646b87f3c438a55f996a9b1d5
  digest: "sha256:1ed51fc8633c7b6a2e868613e941fb56060417059078778996abdf6633c18390"
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

- [x] The demo adapter and the server agree on what a query matches, field by field.
- [x] The placeholder T-0195 wrote is exactly true against both.
- [x] A test compares the two implementations over the same fixture rather than asserting each separately.

## Activity

- 2026-08-07 20:20Z illodev@local#42eb42f5 · claimed
- 2026-08-07 20:30Z illodev@local#42eb42f5 · released

## Notes

- 2026-08-07 20:30Z illodev@local#42eb42f5 — The card scoped this to the three record list endpoints, and there was a fourth site with a rule of its own: the palette's lexical branch in api.demo.ts scored id and title only, weighted 100/50/25/10. The server answers a lexical search with the same ranker as its list routes — searchProjectRecordsHybrid falls through to searchProjectRecords when no provider is configured — so the palette in the hosted demo could not find a record by a word in its body at all, and ranked what it did find in an order the server never produces. All four sites go through the mirror now.

The mirror also carries the filter grammar and negation, not just the tokenizer. Leaving those out would have kept a disagreement the card does not mention: status:draft and -term were being matched as literal substrings.

One expectation of mine was wrong on the way and is worth leaving here. I first checked the whole-token rule with the query 'window' against 'windows', expecting the partial to find nothing. It finds four records, on both backends — a title carries Windows, and the title fallback matches a substring by design. The discriminator has to be a token no title carries and whose prefix no title token contains; 'surviving' / 'survivi' is one, picked from the snapshot rather than guessed.
- 2026-08-07 20:30Z illodev@local#42eb42f5 — local verification: Compared the two implementations directly over the same corpus and over a fixture. Against this repo's live server on 55 memory records, 12 queries agree on both the count and the ordered id list — whole words, partials, metadata-only hits, status: and tag: filters, a negation, and an accented pair. The parity test drives searchProjectRecords and the mirror over one fixture across 23 queries and is mutation-proven three ways: restoring the substring body match reports the card's exact symptom (nvoic finds DOC-0001 in the demo, not on the server), requiring terms as a phrase fails, and dropping the accent folding fails. In the built static demo in Chromium: surviving finds the one body that carries it and survivi finds nothing, and the palette now finds a body-only word at all, which the old id-and-title rule could never do. Full gate green: 471 + 10 tests.
