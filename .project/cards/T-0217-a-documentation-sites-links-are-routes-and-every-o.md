---
id: T-0217
title: A documentation sites links are routes, and every one reads as broken
status: review
type: bug
priority: high
area: docs
created: 2026-08-07
updated: 2026-08-07
---

A documentation site resolves `[text](guides/invoicing)` through its own router:
from the site root rather than from the linking file, and onto whichever file
backs that route — `.md`, `.mdx`, or an `index` inside a folder. Read as a path,
every link in such a tree is broken.

Fube's help tree is 164 files whose editorial guide *mandates* that spelling.
`doctor` reported **635 broken links**, 99% of every warning the workspace had,
and 626 of them resolve fine once the route reading is applied. Underneath sat
six genuinely dead links in `README.md` and `apps/agents/README.md`, pointing at
a documentation tree that was removed and exists nowhere in the repository —
the front door of the project, invisible under the noise.

The comment above this rule already conceded half of it: an indexed document is
read-only through the protocol, so it was downgraded from error to warning
because "a gate that is always red stops being read at all". A warning nobody
can act on is the same failure one severity down.

`docs.routeRoots` names the trees where links are routes. It only ever widens
what resolves — the file-relative reading is still tried first — so it cannot
hide a link that was already fine, and outside those roots a link is still a
path, which is what a README's links are.

Two things came out of the same scan and are fixed with it:

- **Links inside code were followed.** A template teaching the house style by
  printing `` `[texto](categoria/slug)` `` was reported as broken: the document
  doing exactly its job. `parseAcceptance` has skipped fences since T-0157;
  this scan never did. Eight findings in Fube, and — after the fix — one in this
  repository's own SPEC.md, caught by the docs test, in the sentence explaining
  the distinction.
- **The message named the resolved path, not the link.** In a route tree that
  is the doubled one (`clientes/clientes/gestion-clientes`), which is the shape
  that made the finding unreadable as well as wrong. It now reports the target
  as written, with what was tried in the details.

## Acceptance criteria

- [x] `docs.routeRoots` resolves bare links from the root, across `.md`, `.mdx`
      and `index` of either, and site-absolute `/…` too.
- [x] Outside a declared root nothing changes; a real dead link is still found.
- [x] Links inside fences and code spans are not followed, including an
      unclosed fence, which runs to the end as a renderer reads it.
- [x] The code reading is shared with the repository's own docs test rather
      than written twice.
- [x] Suite and strict ratchet green.
- [x] Verified on Fube: 635 link warnings to 8, all 8 genuinely dead, 0 errors.

## Notes

The masking was nearly shipped as a blanked copy of the body, which is wrong in
a way worth recording: blanking changes *what matches*. A real link whose label
is code — ``[`app/(private)/page.tsx`](…)`` — has brackets inside that label, so
the scanner never saw it; erasing the backticks revealed a link whose target the
pattern then truncated at the first `)`, and two managed documents in Fube
turned from clean to **error**. Matching first and discarding what falls inside
code cannot invent a match that was not already there.

## Activity

- 2026-08-07 10:25Z illodev@local#bada1057 · backlog → review
