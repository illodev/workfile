---
id: T-0094
title: Verify compaction restores the brief, and wire PreCompact if not
status: backlog
type: task
priority: low
area: core
created: 2026-08-01
updated: 2026-08-01
---
[[T-0090]] widened the `SessionStart` matcher to `*`, so whatever source the
host sends on compaction now reaches the handler. Whether it sends one at all is
still unknown, and this checkout cannot settle it.

The official hook documentation shipped locally documents `PreCompact` as its
own event — "execute before context compaction" — and its `SessionStart` example
uses `matcher: "*"` without naming any source. Nothing there describes a
`compact` source.

## How to settle it

Run one session to auto-compaction with a hook that logs its whole stdin
payload, and read the log. One line of evidence, and it ends the question.

- If a `SessionStart` arrives with any source after compaction, `*` already
  covers it and this card closes with nothing to build.
- If it does not, the claims board is still lost on every compaction, and the
  steal-list item the second pass talked us out of was right: wire `PreCompact`
  at `agents context` with no card. Guard against double injection if both
  events turn out to fire.

Not a caveat inside another card, because it is a real gap with a real fix and
one observation between them.

## Acceptance criteria

- [ ] A real compaction's hook payload is captured and recorded here
- [ ] The board is proven to return after a compaction, or PreCompact is wired
- [ ] If PreCompact is wired, nothing injects the brief twice
