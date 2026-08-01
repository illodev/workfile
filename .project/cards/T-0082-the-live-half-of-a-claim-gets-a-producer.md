---
id: T-0082
title: The live half of a claim gets a producer
status: done
type: bug
priority: high
area: core
created: 2026-08-01
updated: 2026-08-01
scope: [packages/workfile/src/modules/cards/claims.ts, packages/workfile/src/runtime/claude/hooks.mjs, packages/workfile/test]
---
`recordAgentSignal`, `readAgentSessions`, `pruneAgentSessions` and `claimState` were all built and all correct. Nothing in production called the first one, so no session file was ever written, so `claimState` could only return `unclaimed`, `held` or `stale`. `live` and `orphaned` were unreachable, `card-claim-orphaned` never fired, the UI footer's live count was structurally 0, and `/api/v2/activity` reported a `sessions` array it never received.

The only callers were `scripts/screenshots.ts` and `scripts/demo-video.ts` — so the README screenshots and the landing film showed a state no user could reach.

## The producer is the hook

A one-shot CLI process cannot heartbeat: it writes a signal and exits, and ninety seconds later its own file makes a healthy claim look abandoned. The hook fires for as long as an agent is working. `SessionStart` announces presence and prunes; `PostToolUse` refreshes on **any** tool call, not only writes — an agent that spends ten minutes reading is working.

Written inline, no import: the p95 budget is pinned by a test. That test measures `PreToolUse`, which is untouched.

## Orphaned had to earn its name

The docstring promised "no session signalling, and its recorded process is gone". The code returned `orphaned` for any session outside the 90-second live window, and the recorded pid belongs to the hook process, which exits immediately — so the pid could never settle it.

Now: `live` under 90 seconds, `held` up to 30 minutes, `orphaned` past that. Costless while nothing produced sessions; a warning on every pause the moment something did.

## Evidence

Verified in this repository, not only in a fixture:

- `card claim T-0082` with **no** `--actor` resolved to `illodev@local#e55eab30`.
- A real `post-tool-use` invocation wrote `.project/.cache/activity/sessions/e55eab30-….json` carrying that same actor and the touched file.
- `buildActivitySnapshot` then reported `T-0082 -> live by illodev@local#e55eab30 | session e55eab30`.

Before the identity fix (T-0078) this could not have worked: `claimState` matches a session to a card by `session.actor === card.claimed_by`, and the three surfaces resolved three different strings.

`pnpm run check`: 188 + 7 tests, strict ratchet 601 across 59 files, none new. The test asserts the whole ladder — held with no signal, live after the hook, still held after five minutes of silence, orphaned after forty-five.

`docs/mcp.md` said `events.jsonl` was what the presence indicators read. It has no reader; the sessions directory does. Corrected.

## Activity

- 2026-08-01 17:14Z illodev@local#e55eab30 · doing → review
- 2026-08-01 17:17Z illodev@local#e55eab30 · review → done

