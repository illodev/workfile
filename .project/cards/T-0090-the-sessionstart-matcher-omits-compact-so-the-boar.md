---
id: T-0090
title: The SessionStart matcher omits compact, so the board is never restored
status: backlog
type: bug
priority: low
area: core
created: 2026-08-01
updated: 2026-08-01
---
`src/modules/claude/surface.ts:182` — `matcher: "startup|resume|clear"`, and
`grep -rn "PreCompact" packages/workfile -i` returns nothing across every
extension. After an auto-compaction the claims board is never re-injected, so a
long session loses the one piece of state the protocol depends on at exactly the
point it has forgotten everything else.

## The fix

`"startup|resume|clear|compact"`, regenerated into `.claude/settings.json`
through the managed-file path, plus an assertion in `test/claude-surface.test.ts`
that the matcher covers compact.

Do **not** add a PreCompact hook, which is what the originating item proposed. It
would duplicate a SessionStart the matcher merely fails to trigger.

## Open question, must be settled before this closes

That Claude Code fires SessionStart with source `compact` after auto-compaction
is host behaviour this checkout cannot prove. Run one session to compaction with
a hook that logs its `source` argument, and read the log. If the host does not
fire it, this card becomes the PreCompact hook after all.

## Acceptance criteria

- [ ] The host is observed firing SessionStart with source `compact`
- [ ] The matcher covers it and the generated settings agree
- [ ] A test pins the matcher
