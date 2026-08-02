---
id: T-0128
title: The summary projection drops every declared axis
status: backlog
type: bug
priority: medium
area: core
scope: [packages/workfile/src/modules/records/index.ts]
related: [T-0104]
created: 2026-08-02
updated: 2026-08-02
---

Found while building the board's axis grouping ([[T-0104]]).

`projectRecord` narrows a record to `SUMMARY_FIELDS`, a frozen allowlist of
twenty-nine names (`records/index.ts:724`). Declared axes are per-project flat
frontmatter keys, so no fixed list can contain them: every view except `full`
drops them.

The board is unaffected today only because the card listing asks for `full`.
The comment right above the function says listings ask for `summary`, and the
summary view exists precisely to make listings cheaper — so the first person to
apply that reasoning to `/api/v2/cards` turns the grouping silently empty. The
card still renders, the axis option still appears, and every card lands in the
"no context" bucket.

It is not only the interface. Anything reading a listing in `summary` or `list`
view already cannot see an axis — which includes agents going through MCP,
for whom the axis exists to make work findable by domain in the first place.
Worth checking what the MCP list tools ask for before deciding how wide this
is.

The fix has to come from the workspace rather than from a constant: the
projection needs the declared axis names, which means either passing them in
or keeping any key the config declares. A test now pins the `full` path
(`axes.test.ts`, "a declared axis survives the round trip back out") so the
remaining hole cannot widen unnoticed, but it does not cover the projected
views because they are the thing that is wrong.

## Acceptance criteria

- [ ] A declared axis survives `summary` and `list` views, or the reason it
      must not is recorded
- [ ] The rule comes from the workspace's declared axes, not from a constant
      that has to be remembered
- [ ] The MCP and CLI listings are checked, since an agent finding work by
      domain is the reason the axis exists
