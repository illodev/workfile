---
id: T-0128
title: The summary projection drops every declared axis
status: done
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

- [x] A declared axis survives `summary` and `list` views, or the reason it
      must not is recorded
- [x] The rule comes from the workspace's declared axes, not from a constant
      that has to be remembered
- [x] The MCP and CLI listings are checked, since an agent finding work by
      domain is the reason the axis exists

## Activity

- 2026-08-02 19:13Z illodev@local#aed59c5e · claimed
- 2026-08-02 19:19Z illodev@local#aed59c5e · doing → done

## Notes

- 2026-08-02 19:19Z illodev@local#aed59c5e — Measured first, which changed the shape of the fix.

    summary tira: archived, context, scope, effort, start, due, source, assets
    list tira:    + file, revision

    CLI  card list --json   context = "treasury"
    CLI  card show --json   context = "treasury"
    MCP  project_card_list  context = undefined

So the third criterion is answered: the CLI listing was never affected — it does
not go through this projection — and MCP was, on both `project_card_list` and
`project_search`.

The obvious fix was to pass the declared axis names into `projectRecord`. That
was rejected after counting the call sites: five in `http.ts`, two in
`search.ts`, one in the CLI, plus MCP's own. Threading a rule through eight
entrances is the failure this module has already had three times, recorded as
[[LRN-0012]] — and the second criterion asks for the opposite of that.

Instead the record carries it. `recordFromCard` already receives the workspace,
and it is the single place a card becomes a record, so it stamps the names of
the axes that card actually has; `projectRecord` keeps whatever the record
names. One writer, one reader, and nothing in between has to be told. Listings
gained an `axes` field as a side effect, which is worth having on its own: a
reader can discover a project's axes without knowing its vocabulary first.

Verified from the CLI and through the MCP protocol server, before and after.
The test pins both `project_card_list` and `project_search`, including that a
card with no value carries neither the key nor the name.

Found while measuring, and left alone deliberately: the same projection drops
`archived`, so an archived card is indistinguishable from a live one in the
listing an agent reads — `path` containing `/archive/` is the only tell. That
is a correctness problem rather than a missing convenience and it is not what
this card was about, so it is [[T-0130]].

234 + 7 tests pass, strict holds at baseline.
