---
id: CHG-0148
title: Documentation trees can declare that their links are routes
type: added
area: docs
visibility: public
cards: [T-0217]
created: 2026-08-07
updated: 2026-08-07
---

A documentation tree can now say that its links are routes rather than paths, so
`doctor` stops reporting a whole published site as broken.

`docs.routeRoots` names the trees where `[text](guides/invoicing)` means "the
page at that route": resolved from the root named, not from the linking file,
and onto whichever file backs it — `.md`, `.mdx`, or an `index` of either. Read
as paths, every link in such a tree is broken; one repository collected 635 of
those warnings, 99% of everything `doctor` had to say, with six genuinely dead
links buried underneath. It only ever widens what resolves, so outside a
declared root a link is still a path.

Two fixes ride along. Links inside fenced blocks and code spans are no longer
followed — a template teaching the house link style by printing an example was
reported as broken. And the finding now names the link as written instead of the
path it resolved to, which in a route tree was the doubled one and unreadable.
