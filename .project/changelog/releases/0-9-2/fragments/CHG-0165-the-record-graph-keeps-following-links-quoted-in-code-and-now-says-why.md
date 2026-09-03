---
id: CHG-0165
title: The record graph keeps following links quoted in code, and now says why
type: changed
area: core
visibility: public
created: 2026-09-03
updated: 2026-09-03
---

The doc checker masks code before following links; the record graph does not. T-0236 asked whether that was an oversight. Measured over a 2 700-record repository: 1 863 Markdown links, 17 inside a code span or fence, and 0 of those 17 produce an edge — the mask would change nothing.

The reason is that the two consumers filter differently: an edge needs the target to resolve to a record the index already knows, and what people quote in a fence is a template placeholder or a path into source code. The checker resolves against files on disk, where a placeholder can land on a real path.

So the asymmetry stays, documented and pinned by a test, rather than being unified for symmetry at the cost of the one case it cannot distinguish: a record documenting a relationship by quoting the other's path.
