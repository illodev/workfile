---
id: T-0099
title: The guard asks about your own claim again, now that the board is live
status: backlog
type: bug
priority: high
area: core
scope: [packages/workfile/src/runtime/claude/hooks.mjs, packages/workfile/bin/workfile.ts]
related: [T-0089]
created: 2026-08-01
updated: 2026-08-01
---

Reproduced by replaying a real payload against the built hook:

```
$ echo '{"session_id":"e55eab30-...","cwd":"...","tool_name":"Edit",
         "tool_input":{"file_path":".../README.md"}}' \
    | node src/runtime/claude/hooks.mjs pre-tool-use
{"permissionDecision":"ask","permissionDecisionReason":"T-0096 is claimed by
 claude-opus-5 and its scope covers README.md. Coordinate, or claim the card
 yourself first."}
```

The session that claimed T-0096 is the session being asked. `card claim --actor`
took the free-text string `claude-opus-5`; `actorFor` (hooks.mjs:149) computes
`${USER}@${HOSTNAME}#${session8}`. Two identities, no relation, so
`claim.claimedBy !== mine` on every write to a file in your own scope.

This is the failure the comment at hooks.mjs:145 says was already fixed:

> the guard below compared `claimed_by` against a session UUID. They never
> matched, so it asked about every claim including your own, which is how a
> guard rail teaches people to turn it off.

Only the hook side was fixed. Nothing constrains what the CLI writes.

T-0089 is what made it visible: before it, `board.json` was written at session
start only, so a claim taken mid-session was invisible to the guard and this
never fired. The board is live now, and the first thing it does is flag its own
session.

It also defeats `bypassPermissions`, correctly — a hook's `ask` is the
repository speaking, not Claude Code, so it outranks the mode. The blast radius
is therefore every user with the plugin installed, in the mode most likely to
be running unattended.

Workaround: `export WORKFILE_ACTOR=claude-opus-5`, which `actorFor` honours
first.

## The fix

One derivation, used by both. `actorFor` already reads `WORKFILE_ACTOR` — have
the CLI default `--actor` to the same function, and record on the claim which
identity scheme produced it, so a claim made by hand still matches. Compare
normalized, not raw.

## Acceptance criteria

- [ ] A claim taken by the session's own default actor does not prompt that session
- [ ] A claim by a different actor still prompts
- [ ] A test replays a PreToolUse payload for both cases, mirroring T-0089's
