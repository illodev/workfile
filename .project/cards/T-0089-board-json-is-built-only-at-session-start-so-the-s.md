---
id: T-0089
title: board.json is built only at session start, so the scope guard is inert
status: done
type: bug
priority: medium
area: core
created: 2026-08-01
updated: 2026-08-01
scope: [packages/workfile/src/runtime/claude, packages/workfile/src/modules/cards, packages/workfile/test]
---
`.project/.cache/activity/board.json` read, before the fix:

```
{"claims":[],"builtAt":"2026-08-01T11:41:17.221Z"}
```

Written only by `sessionStart` (`hooks.mjs:229`) and read only by `preToolUse`
(`:294`). This session claimed nine cards between 16:05 and 16:26 against a
board built at 11:41 holding zero claims.

So the `PreToolUse` scope guard — the thing that warns an agent it is about to
edit a path someone else holds — has been reading an empty board for this
repository's entire history. T-0078 found that the guard compared a session UUID
against an actor name; that was real and is fixed, and this is the deeper reason
it has never fired.

Every existing test hid it by seeding claims **before** starting the session,
which is the one ordering under which a session-start-only board is correct.

## Why `postToolUse` was the wrong answer

The card proposed refreshing the board from `postToolUse` when the tool wrote
under `.project/cards/`. That does not work, and the reason is worth keeping.

`postToolUse` fires only for *this* session's tool calls, so it can only learn
about claims this session took. The guard filters on `claim.claimedBy !== mine`
— it deliberately ignores this session's own claims. Refreshing from
`postToolUse` would have refreshed exactly the entries the guard discards, and
still missed every claim taken by the other agent, which is the only case the
guard exists for.

## What shipped

A cache of claims belongs to whatever changes claims. `updateClaimBoard` lives
in `claims.ts` and is called from `mutateCard` after a successful write, when
one of `claimed_by`, `claimed_at`, `status`, `title` or `scope` actually
changed. That covers every surface at once — CLI, HTTP, MCP — and every agent
sharing the working tree, because another session's `card claim` writes the same
file.

A **delta**, not a rebuild. A rebuild would re-read every card, which is the
cost T-0081 removed from mutations, and it would be wrong under concurrency:
two agents claiming different cards hold different card locks, so a rebuild from
a listing read before the other claim would silently drop it. Touching only this
card's entry cannot lose another's. The board file has its own lock, always
taken inside the card lock and never the reverse.

Measured on bench S, in one run so the comparison is exact:

| operation | fs ops | vs a bare corpus read |
|---|---:|---:|
| bare corpus read | 156 | 1.000x |
| `patch`, no claim field | 171 | 1.096x |
| `claim` | 184 | 1.179x |
| `release` / `transition` | 186 | 1.192x |

13 operations for the board write, against a gate ceiling of 1.5x. A patch that
touches no claim field is unchanged, which is the short-circuit working.

`sessionStart` keeps its own builder for a fresh clone and for cards edited by
hand or changed by a branch switch. The two producers are pinned by a test that
compares their output.

Not covered: `createCard` with `claimed_by` set at creation does not write the
board. It is reachable through the API and used by nothing; session start
repairs it.

## Acceptance criteria

- [x] A claim made during a session is visible to the next `PreToolUse` in the same session
- [x] A release clears it again, without another session start
- [x] The hook stays inside its measured latency budget
- [x] `test/claude-surface.test.ts` median budget stays green
- [x] A test asserts the guard fires on a claim made after session start, and fails without the fix
- [x] The hook's builder and the core's produce the same board
- [x] A mutation that changes no claim field does not rewrite the board
- [x] The added cost stays well inside the existing 1.5x operation gate

## Activity

- 2026-08-01 19:22Z illodev@local#e55eab30 · doing → review
- 2026-08-01 19:25Z illodev@local#e55eab30 · review → done

