---
id: T-0115
title: card write erases the durable trail
status: done
type: bug
priority: high
area: core
scope: [packages/workfile/src/modules/cards/mutations.ts]
related: [T-0108]
created: 2026-08-02
updated: 2026-08-02
---

Found while fixing [[T-0108]], and it defeats that card more completely than
the bug it was about.

`## Activity` lives in the card body. `patchCardBody` replaces everything after
the frontmatter wholesale, so writing a body drops the trail with it.
Reproduced on a scratch workspace — a card with two trail lines, then
`echo "new body" | workfile card write T-0001`:

```
---
id: T-0001
...
claimed_at: "2026-08-02T17:06:09.667Z"
---
new body
```

The frontmatter survives because it is parsed and re-emitted. The trail does
not, because as far as this path is concerned it was prose.

What makes it serious rather than a sharp edge: `project_card_write` is an
agent-facing MCP tool, and replacing a body is exactly what it is for. So the
record that answers "who moved T-0042 to done, and when" months later, from
git alone, is erased by a routine operation — silently, with no warning and no
way to notice from the command's output. Suppressing redundant lines is
pointless if one write removes the section.

The claim that the trail is append-only, and that a merge between two branches
resolves by keeping both lines, is false while this exists: a write is a
deletion the merge cannot see.

The fix belongs where the body is replaced, not at the callers, for the reason
[[T-0108]] gave — `card write`, the HTTP body routes and `project_card_write`
all reach the same place. Preserving the section the way frontmatter is
preserved, rather than asking every caller to carry it forward, is the shape
that cannot be forgotten.

Worth deciding as part of it: whether a body write should itself leave a trail
line. It is a protocol event by any reading, and today it leaves none.
- 2026-08-02 17:49Z illodev@local#aed59c5e · claimed
- 2026-08-02 17:53Z illodev@local#aed59c5e · doing → done

## Acceptance criteria

- [x] A body write preserves the existing `## Activity` section
- [x] The guarantee holds through the CLI, the HTTP routes and MCP, because
      the preservation sits where the body is replaced
- [x] A test pins it, since the trail had no coverage at all before [[T-0108]]

## Notes

- 2026-08-02 17:53Z illodev@local#aed59c5e — Wider than the card: `## Notes` went the same way as `## Activity`, and that
matters more than it looks. Notes is where `claimCard` writes the reason one
actor gave for taking another's claim — the record [[T-0117]] closed two hours
ago promising that taking a claim over "still records why". It recorded it, and
then any body write erased it.

Reproduced before, on a card claimed, taken over with a reason, and annotated:
one `card write` left frontmatter plus the single line it was sent. The
frontmatter survived because it is parsed and re-emitted; everything else was
prose as far as that path could tell.

Fixed at the point where the body is replaced, so both surfaces that can write
a body inherit it — `bin/workfile.ts:1439` and `mcp/tools.ts:583` both call
`patchCardBody`. The second criterion names HTTP too: there is no HTTP
body-write route, which I checked rather than assumed, so it holds there by
there being nothing to hold.

The rule is that the protocol sections come from what is stored, never from
what was sent. Verified from the CLI across four shapes:

    omite las secciones      -> both come back, prose replaced
    round-trip fiel          -> byte-identical to what was sent
    rastro truncado          -> stored trail wins, both lines survive
    tarjeta sin secciones    -> plain write, unchanged behaviour

The third of those is the one that makes "append-only" true rather than
aspirational. A section any caller can replace is not append-only, and the
trail's own contract says a merge between two branches resolves by keeping both
sides' lines.

The trade, stated because it is a real loss: those sections can no longer be
edited through a body write. `card note` appends and nothing edits, so there
was no supported way to edit them anyway — but a caller who was using
`card write` for it will find it silently ineffective rather than refused.
Worth revisiting if anyone was.

Found while writing the test: the `trail()` helper added in [[T-0108]] matched
timestamped lines across the whole body, and `card note` writes the same shape,
so a card with notes counted them as trail entries. It had no notes in that
test, so it passed. Now scoped to its section.

230 + 7 tests pass, strict holds at baseline.
