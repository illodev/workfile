---
id: LRN-0018
title: Documentation rots exactly where no mechanism reads it, and the gap is always narrower than it looks
status: active
created: 2026-08-04
updated: 2026-08-04
---

A full documentation audit produced four independent defects, and every one of
them sat in a blind spot of a check that was already running and already
passing. The suite was not missing; it was aimed slightly wrong each time.

- `SECURITY.md` carried the only broken link in the repository. It is outside
  the `docs.sources` glob, so the freshness index never saw it, and it was
  missing from the `DOCS` list in `documentation.test.ts`, so none of the seven
  checks opened it. Two mechanisms, both healthy, both blind to the same file.
- SPEC section 23 named thirteen MCP tools that never existed and none of the
  thirty that do, since 0.1.0. `documentation.test.ts` opens SPEC.md five times.
  Its `INVOCATION` regex matches `workfile <word>`, and a tool name is not an
  invocation.
- SPEC section 16.2 named three exports and three types the package does not
  have, and nine `workspace.cards.list(...)` lines for an object shape that has
  never existed. `test/types/public-api.ts` typechecks the API that exists;
  nothing read the API a reader is told exists.
- `docs/mcp.md` said the generated `.mcp.json` registers `workfile-mcp`, wrong
  since 0.4.0. T-0116's own check compares `claudeMcpFile()` against every
  stated copy — but it parses fenced JSON blocks, and this fourth copy was
  prose in a table cell.

The pattern is not "write more tests". Each of these was one clause away from
being caught: a list with one entry missing, a regex matching commands but not
identifiers, a parser reading blocks but not sentences. When adding a
documentation check, the question worth asking is not what it verifies but what
shape of statement it cannot see — and the answer is usually prose, because
prose is where a fact goes when nobody wants to maintain a second copy of it.

Two consequences worth carrying forward.

**Prefer joining an existing check to adding a parallel one.** `mcp.md` was
fixed by restating the configuration as a fenced block so the existing
comparison covers it, rather than by writing a rule for table cells. One fewer
copy beats one more rule.

**Coverage checks belong in both directions.** Every check in the suite asked
whether a doc teaches something that does not exist. Nothing asked whether
something that exists is taught, and that direction held nine undocumented
command aliases and three configuration keys documented in no file at all.
Membership is cheap to verify and catches the whole class; accuracy of the
description is not testable and should not be pretended at.

The cost of the whole audit was about 30 ms of new test time across six checks.
