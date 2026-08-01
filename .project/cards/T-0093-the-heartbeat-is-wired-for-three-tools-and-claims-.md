---
id: T-0093
title: The heartbeat is wired for three tools and claims to cover all
status: review
type: bug
priority: medium
area: core
created: 2026-08-01
updated: 2026-08-01
scope: [packages/workfile/src/modules/claude, packages/workfile/src/runtime/claude, packages/workfile/test/claude-surface.test.ts]
---
Found by running `doctor` in this repository, which reported this session's own
claim as abandoned while the session was working.

T-0082 changed the hook body so presence is refreshed by **any** tool call, and
the comment says why:

> Presence is refreshed by any tool call. Reading and running commands is
> working; restricting the heartbeat to writes would report an agent that spent
> ten minutes investigating as gone.

It left the generated matcher alone. `surface.ts` still emitted
`matcher: "Edit|Write|NotebookEdit"` for `PostToolUse`, so the hook was never
invoked for anything else and the body's intent never reached a session.

Measured here: `lastSignalAt` 19:21Z against a wall clock of 20:08Z, 47 minutes
of continuous `Bash` calls in between, and `card-claim-orphaned` on T-0092 —
exactly the failure the comment describes, in the repository that wrote it.

## The fix, and why it is not the obvious one

Not "add `Bash` to the list". The defect is the list.

`PostToolUse` matches `*` now, because its handler does not discriminate and an
enumeration that outlives the handler is what shipped twice. [[T-0090]] had the
same shape from the other side — `SessionStart` never reads `source` and
enumerated three of them — so it is fixed here in the same change and for the
same reason.

`PreToolUse` stays narrow, and that is not an inconsistency: it guards file
writes, it runs before every call it matches, and the latency budget is built
on not spawning node for a `Bash`. The test asserts that too, in the opposite
direction — it must *not* be asked about a tool it would ignore.

## The test

The assertion is the pair, never the literal, because a matcher and its handler
are each defensible alone. Each case drives the hook with an event the handler
must act on, proves it acted — the session file is written — and then proves the
generated matcher would have let that event reach it. It fails on the matchers
as they were, naming `Bash`.

## A third copy, found on the way out

`plugins/workfile/hooks/hooks.json` — the wiring a user installs from the
marketplace — was **hand-maintained**, in a script whose header says "nothing
here is hand-maintained", and the drift test that exists to catch exactly this
compared the runtime, the commands, the skill, the manifests and the MCP entry,
and not the hooks. So the corrected matchers would have shipped to people who
build from source and not to the people who install the plugin.

`claudeHooksFile(runtime)` is exported and parameterised now; the script
generates that file, and the drift test compares it. Verified by editing the
packaged copy by hand and watching the test fail.

## Acceptance criteria

- [x] The heartbeat is refreshed by a Bash call, not only by a write
- [x] `PreToolUse` stays narrow and off the hot path, asserted
- [x] A test fails when a matcher stops covering what its handler acts on
- [x] The test fails on the matchers as they were
- [x] The plugin mirror and this repository's own settings are regenerated
- [x] The plugin's hook wiring is generated, not hand-maintained
- [x] The drift test compares it, and fails when it is edited by hand

## Activity

- 2026-08-01 20:26Z illodev@local#e55eab30 · review → review
