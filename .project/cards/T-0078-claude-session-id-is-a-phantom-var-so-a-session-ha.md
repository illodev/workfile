---
id: T-0078
title: CLAUDE_SESSION_ID is a phantom var, so a session has three actor identities
status: backlog
type: bug
priority: high
area: core
created: 2026-08-01
updated: 2026-08-01
---

Claude Code sets `CLAUDE_CODE_SESSION_ID`. Three call sites read `CLAUDE_SESSION_ID`, which is never set:

- `bin/workfile.ts:614` (`defaultActor()`)
- `src/modules/mcp/tools.ts:105`
- `src/runtime/claude/hooks.mjs:126`

Confirmed in this shell: `CLAUDE_CODE_SESSION_ID` is set, `CLAUDE_SESSION_ID` is unset.

## Consequence

The CLI falls through to `$USER@$HOSTNAME`; the hook compares a session UUID; MCP derives `mcp:<clientName>`. Three identities per session that never match.

Both directions of the README claim "two agents in one checkout collide loudly" are false in the shipped default: the PreToolUse guard fires against your **own** claim, while two parallel sessions on one machine resolve to the **same** `$USER@$HOSTNAME` and never collide at all.

## Fix

One `resolveActor()` in a shared module: `$WORKFILE_ACTOR` then `cards.actor` then `$USER@$HOSTNAME`. Delete the session-id rung rather than renaming it — a fresh UUID in git-committed `claimed_by` recreates the `agent-56a30d1b` pattern that `defaultActor()`'s own comment exists to prevent. Session ids are a ledger key, never durable identity.

Ship `workfile agents whoami` printing the resolved actor and which rung produced it, with a USAGE line in the same change.

Acceptance: two processes with different session ids in one checkout must produce `CARD_ALREADY_CLAIMED`. Today they do not.
