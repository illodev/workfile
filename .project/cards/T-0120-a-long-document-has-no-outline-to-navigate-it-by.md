---
id: T-0120
title: A long document has no outline to navigate it by
status: done
type: feature
priority: medium
area: ui
tags: [ui-polish]
scope: [packages/workfile/ui/src/components/Docs.tsx, packages/workfile/ui/src/components/Markdown.tsx]
created: 2026-08-02
updated: 2026-08-02
---

The Docs reader renders a document as one column with no map of it. The specs in this workspace run past a dozen headings — SPEC.md alone is thousands of words — and the only way to reach a section is to scroll and read the headings as they pass.

Every reading surface worth copying (ChatGPT's canvas, GitHub's file view, any docs site) answers this the same way: a heading list beside the prose, the current section marked, click to jump.

`MarkdownBody` renders headings without ids, so nothing can link to a section yet. That is the piece the outline needs and the piece an anchor link would need too.

## Acceptance criteria

- [x] Rendered headings carry stable ids
- [x] The Docs reader shows an outline of the open document beside the prose
- [x] The section currently on screen is marked in the outline
- [x] Clicking an entry moves the reader to that heading
- [x] The outline yields on a narrow viewport rather than squeezing the prose, and stays out of the way of documents with nothing to outline

## Activity

- 2026-08-02 18:08Z illodev@local#c0b2d745 · claimed
- 2026-08-02 18:13Z illodev@local#c0b2d745 · doing → review
- 2026-08-02 18:32Z illodev@local#c0b2d745 · review → done

## Findings

- 2026-08-02 18:32Z illodev@local#c0b2d745 — Verified on the real spec (PATH-CCCA829270B7, packages/workfile/docs/SPEC.md): the rail lists 162 headings with their nesting, marks the section on screen, and a click scrolls the reader 2,643px to it. Heading ids are the line number rather than a slug of the text — two sections called "Notes" are ordinary in a record body, and a slug would give them the same anchor. The prefix prop exists because the inspector drawer stays mounted behind the Docs reader, so two bodies can share the document at once.
