---
id: LRN-0006
title: A derived identity is only as good as the surfaces that cannot override it
status: active
confidence: high
related: [T-0099, T-0089]
created: 2026-08-01
updated: 2026-08-01
---

A guard that derives an identity is disarmed by any surface that lets you name
one. `core/actor.ts` unified the derivation across the CLI, MCP and HTTP, and
`hooks.mjs` reproduces it exactly — but `--actor` outranks all of it, so the
generated protocol saying `card claim ID --actor ACTOR` was enough to make the
PreToolUse guard ask about every claim its own session took, and to lock that
session out with `CARD_CLAIM_OWNER_MISMATCH`.

Fixing the derivation without fixing what teaches people to bypass it is half a
fix. `actor.ts:21-24` had already identified the documentation as the cause and
changed only the code; the failure came back the moment T-0089 made the board
live enough to notice.

## How to apply

- Claim with no `--actor`. `agents whoami` prints the identity that will be
  recorded, and the guard compares against exactly that.
- `--actor` is for claiming as someone else — CI as a bot, a person for a
  colleague. The CLI now warns when it differs from the session's own.
- When a check derives a value, look for every surface that lets a caller
  supply one instead, and make sure none of them is what the docs teach.
