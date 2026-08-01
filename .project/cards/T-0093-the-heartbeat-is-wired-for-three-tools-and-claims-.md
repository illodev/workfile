---
id: T-0093
title: The heartbeat is wired for three tools and claims to cover all
status: backlog
type: bug
priority: medium
area: core
created: 2026-08-01
updated: 2026-08-01
---
Found by running `doctor` in this repository, which reported this session's own
claim as abandoned while the session was working.

T-0082 changed the hook body so presence is refreshed by **any** tool call, and
the comment says why:

> Presence is refreshed by any tool call. Reading and running commands is
> working; restricting the heartbeat to writes would report an agent that spent
> ten minutes investigating as gone.

It left the generated matcher alone. `surface.ts:194` still emits
`matcher: "Edit|Write|NotebookEdit"` for `PostToolUse`, so the hook is never
invoked for anything else and the body's intent never reaches a session.

Measured here: `lastSignalAt` 19:21Z against a wall clock of 20:08Z, 47 minutes
of continuous Bash tool calls in between, and `card-claim-orphaned` on T-0092 —
exactly the failure the comment describes, in the repository that wrote it.

Same shape as [[T-0090]]: the code and the matcher that invokes it disagree, and
nothing compares them.

## The fix

Widen the `PostToolUse` matcher to every tool. `PreToolUse` must stay narrow —
it runs before each call and only guards file writes, and the latency budget is
built on that.

The real work is the test: a matcher that does not match what the handler
handles is not visible from either side alone. Assert that every handler's
matcher covers the events it reads — `postToolUse` reads `tool_name` for any
tool, so its matcher must not enumerate three.

## Acceptance criteria

- [ ] The heartbeat is refreshed by a Bash call, not only by a write
- [ ] `PreToolUse` stays narrow and stays inside its latency budget
- [ ] A test fails when a matcher stops covering what its handler reads
- [ ] `doctor` stops reporting a working session as orphaned
