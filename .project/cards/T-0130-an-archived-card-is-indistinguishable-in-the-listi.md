---
id: T-0130
title: An archived card is indistinguishable in the listings agents read
status: backlog
type: bug
priority: medium
area: mcp
scope: [packages/workfile/src/modules/records/index.ts, packages/workfile/src/modules/mcp/tools.ts]
related: [T-0128]
created: 2026-08-02
updated: 2026-08-02
---

Found while fixing [[T-0128]], measuring what the `list` projection drops.
Same root cause, different consequence.

Archived cards appear in `project_card_list` alongside live ones, and
`archived` is not a field the projection keeps:

```
T-0001 Viva       status=backlog archived=undefined path=.project/cards/T-0001-viva.md
T-0002 Archivada  status=done    archived=undefined path=.project/cards/archive/T-0002-archivada.md
```

The only thing telling them apart is `/archive/` inside `path`, which an agent
would have to know to parse — a convention nothing states and nothing enforces.
`status: done` is not the signal either: a card can be done and live, and an
archived card keeps whichever terminal status it had.

The measured drop for `summary` and `list` was `archived, context, scope,
effort, start, due, source, assets`. [[T-0128]] fixed the axis half, because
that is what its card was about. This is the half that reads as a correctness
problem rather than a missing convenience: an agent listing work can pick up
something that was deliberately put away.

Worth deciding rather than patching: whether `archived` belongs in
`SUMMARY_FIELDS`, or whether listings should exclude archived cards unless
asked — the CLI's `card list` has an `--archived` notion and the MCP tool has
none, which is the difference worth closing. The same question covers `start`
and `due`, since a listing that cannot show dates is why the timeline exists as
a separate view.

## Acceptance criteria

- [ ] An agent listing cards can tell an archived one from a live one without
      parsing a path
- [ ] The choice between carrying the field and filtering the rows is recorded,
      since they answer different questions
- [ ] Whatever is decided is pinned by a test, as the axis half now is
