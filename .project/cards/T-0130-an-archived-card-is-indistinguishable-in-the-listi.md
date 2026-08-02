---
id: T-0130
title: An archived card is indistinguishable in the listings agents read
status: done
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

- [x] An agent listing cards can tell an archived one from a live one without
      parsing a path
- [x] The choice between carrying the field and filtering the rows is recorded,
      since they answer different questions
- [x] Whatever is decided is pinned by a test, as the axis half now is

## Activity

- 2026-08-02 19:26Z illodev@local#aed59c5e · claimed
- 2026-08-02 19:29Z illodev@local#aed59c5e · doing → done

## Notes

- 2026-08-02 19:29Z illodev@local#aed59c5e — Decision on the second criterion: carry the field, leave the rows alone.

Comparing the surfaces settled it. The CLI's `card list` does not filter
archived cards either — `filterCards` in bin/workfile.ts has no archived
predicate — but its output carries `archived`, so the two are distinguishable
there. The disagreement between CLI and MCP was never about which cards exist,
only about whether you could tell. Filtering MCP's rows would have introduced
the first kind of disagreement to fix the second.

The argument that decides it rather than merely favours it: `project_card_reopen`
exists, and its whole job is moving an archived card back into the live backlog.
A listing that hid archived cards would leave an agent nothing to reopen — the
tool would be reachable only by already knowing an id.

So `archived` joins `SUMMARY_FIELDS`, and lands as an explicit `false` on live
cards rather than being absent. "No such key" and "not archived" are the same
shape to a reader, which is the bug this had.

    antes:  T-0001 archived=undefined  T-0002 archived=undefined
    ahora:  T-0001 archived=false      T-0002 archived=true

Scoped to `archived` on purpose. The same projection also drops `scope`,
`effort`, `start`, `due`, `source` and `assets`, which this card's body raised —
but those are a size-against-usefulness question, and this one was a correctness
question: an agent could act on work that had been put away. Left for whoever
wants to argue the payload, rather than folded in here where it would ride along
unexamined.

Pinned by a test in mcp.test.ts against the fixture's own archived card.
235 + 7 tests pass, strict holds at baseline.
