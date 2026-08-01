---
id: T-0089
title: board.json is built only at session start, so the scope guard is inert
status: backlog
type: bug
priority: medium
area: core
created: 2026-08-01
updated: 2026-08-01
---
`.project/.cache/activity/board.json` reads, right now:

```
{"claims":[],"builtAt":"2026-08-01T11:41:17.221Z"}
```

It is written only by `sessionStart` (`hooks.mjs:229-236`) and read only by
`preToolUse` (`:294`). This session claimed nine cards between 16:05 and 16:26
against a board built at 11:41 that holds zero claims.

So the `PreToolUse` scope guard — the mechanism that is supposed to warn an
agent it is about to edit a path someone else has claimed — has been reading an
empty board for this repository's entire history. T-0078 found that the guard
compared a session UUID against an actor name; that was real and is fixed, and
this is the deeper reason it has never fired.

## The fix

The rebuild cannot go in `PreToolUse`: reading all 84 cards measured 27.15 ms
against a hook process budget of roughly 31 ms.

Two candidates:
- refresh `board.json` from `postToolUse` when the tool wrote under
  `.project/cards/`
- have `claimCard`/`releaseCard` invalidate it

The first keeps the hook layer self-contained; the second is exact but puts
knowledge of the hook cache inside the core.

## Acceptance criteria

- [ ] A claim made during a session is visible to the next `PreToolUse` in the same session
- [ ] The hook stays inside its measured latency budget
- [ ] `test/claude-surface.test.ts` median budget stays green
- [ ] A test asserts the guard fires on a claim made after session start
