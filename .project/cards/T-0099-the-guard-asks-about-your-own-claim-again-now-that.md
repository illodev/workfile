---
id: T-0099
title: The guard asks about your own claim again, now that the board is live
status: done
type: bug
priority: high
area: core
scope: [packages/workfile/src/runtime/claude/hooks.mjs, packages/workfile/bin/workfile.ts, packages/workfile/docs/SPEC.md]
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

- [x] A claim taken by the session's own default actor does not prompt that session
- [x] A claim by a different actor still prompts
- [x] A test replays a PreToolUse payload for both cases, mirroring T-0089's

## Activity

- 2026-08-01 23:21Z illodev@9230480325690 · claimed
- 2026-08-01 23:22Z illodev@9230480325690 · released
- 2026-08-01 23:22Z illodev@local#e55eab30 · claimed
- 2026-08-01 23:33Z illodev@local#e55eab30 · doing → review
- 2026-08-01 23:33Z illodev@local#e55eab30 · review → done
- 2026-08-01 23:33Z illodev@local#e55eab30 · released

## Notes

- 2026-08-01 23:30Z illodev@local#e55eab30 — The card's diagnosis was wrong and the truth is worse. The two derivations do not disagree: core/actor.ts resolves illodev@local#e55eab30 from CLAUDE_CODE_SESSION_ID, and the hook's actorFor derives the identical string from the payload's session_id. Claiming with no --actor and replaying a PreToolUse for that session produces silence. What broke it was passing --actor claude-opus-5 by hand, which outranks every other rung — and the generated protocol taught exactly that, in four places and two languages: card claim ID --actor ACTOR, card claim T-0001 --actor session-id, and 'Claim the card with a stable actor identifier for the session'. So the failure shipped to every repository that ran agents sync, in the file agents are told to read first. actor.ts:21-24 already named the documentation as the cause; only the code was fixed.
- 2026-08-01 23:33Z illodev@local#e55eab30 — Runtime evidence: with the claim held by this session's resolved identity, replaying a real PreToolUse payload against the built hook produces no output; with a foreign actor it returns permissionDecision ask naming that actor. Both tests were confirmed to fail against a perturbed derivation and against the pre-fix protocol text, in each language separately. The CLI warning was checked in a throwaway workspace: it prints on an invented actor and is silent on the default. pnpm run check green at 205 + 7, ratchet 599 across 59 files, doctor 0/0. CI green on both platforms at 6636918.
