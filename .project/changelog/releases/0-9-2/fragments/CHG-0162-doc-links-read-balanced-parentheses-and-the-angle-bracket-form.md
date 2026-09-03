---
id: CHG-0162
title: Doc links read balanced parentheses and the angle-bracket form
type: fixed
area: core
visibility: public
created: 2026-09-03
updated: 2026-09-03
---

A link destination ended at the first `)`, so every link into a parenthesised directory — a Next.js App Router route group, which is how half of such an application is laid out — was validated against a truncated path nobody wrote, and the `<…>` form Markdown defines for exactly that case truncated the same way. 182 links in one consuming repository were affected and none was validated. The extractor now counts depth, reads the angle form, and honours `\\)` as an escape.

It also lived in two places: the record graph's `markdown` relation had its own copy, with the same truncation and without the bound, and a body of unterminated links cost 37.6s inside it. Both now share `core/markdown.ts`; indexing a pathological document went from 39.3s to 951ms.
