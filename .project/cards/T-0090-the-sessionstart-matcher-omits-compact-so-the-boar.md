---
id: T-0090
title: The SessionStart matcher omits compact, so the board is never restored
status: review
type: bug
priority: low
area: core
created: 2026-08-01
updated: 2026-08-01
scope: [packages/workfile/src/modules/claude]
---
`surface.ts` emitted `matcher: "startup|resume|clear"` for `SessionStart`, and
`grep -rn "PreCompact" packages/workfile -i` returned nothing across every
extension. So after an auto-compaction the claims board was never re-injected.

## What the second pass proposed, and why it was wrong

It said: add `compact` to the enumeration, do not add a PreCompact hook. It also
flagged, correctly, that whether Claude Code fires `SessionStart` with source
`compact` is host behaviour this checkout cannot prove — and made the fix depend
on it.

Checked against the official hook documentation shipped locally
(`~/.claude/plugins/marketplaces/claude-plugins-official/plugins/plugin-dev/skills/hook-development/`):
it documents **`PreCompact`** as its own event, "execute before context
compaction", and its `SessionStart` example uses `matcher: "*"`. Nothing there
names a `compact` source. That is not proof one does not exist, but it is enough
to stop betting the fix on it.

## What shipped

`matcher: "*"`. The handler never reads `source`, so enumerating sources could
only ever go stale — whatever the host sends now or adds later reaches it. The
unknown stops mattering rather than being resolved, which is the better outcome
for a question this checkout cannot settle.

Same change as [[T-0093]], same reason: the defect in both is enumerating a
selector the handler does not discriminate on. The test asserts the pair.

## Still open, and now honestly narrow

If the host does **not** produce a `SessionStart` on compaction, the board is
still not restored after one, and `PreCompact` is the answer after all. That is
one observation away and is filed as its own card rather than left as a caveat
inside this one.

## Acceptance criteria

- [x] `SessionStart` reaches the handler for every source, including compact
- [x] The matcher does not enumerate sources the handler never reads
- [x] A test covers the pairing and fails on the matcher as it was
- [x] The residual host question is filed rather than assumed

## Activity

- 2026-08-01 20:23Z illodev@local#e55eab30 · doing → review
