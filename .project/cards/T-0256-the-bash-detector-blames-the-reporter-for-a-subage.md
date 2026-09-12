---
id: T-0256
title: The Bash detector blames the reporter for a subagent's own change
status: backlog
type: bug
priority: medium
area: core
source: .project/docs/research/DOC-0007-field-report-a-consuming-agent-on-0-13-0-relayed-2026-09-12.md
related: [DOC-0007, T-0227]
raised: derived
produced_by:
  model: claude-fable-5-1
  reasoning: xhigh
  basis: self-reported
created: 2026-09-12
updated: 2026-09-12
---

A consuming agent reports the PostToolUse detector working — right actor, right `claimed_by`, the event in `events.jsonl` — and one false positive: its subagents run inside its session, so a change made by the claim holder itself through the CLI was reported to the parent as «most likely yours».

What the detector does today (T-0227): after a `Bash` call it walks the scopes *other* actors hold, and says «silent in that window» or «may be theirs» depending on whether the holder's session file signalled inside the window. Two things it cannot see, and both are in play here. A subagent's hook payloads may carry the parent's `session_id` with an `agent_id` beside it — the hook ignores `agent_id`, so a subagent and its parent are one session to the ledger and one actor to the guard, and a change either of them makes inside a scope the other holds is attributed to whoever's `Bash` finished last. And a CLI write into `.project` is never scanned, so the reported change was outside the protocol root, made by a process the ledger could not tell from the reporter.

To measure before designing: what `session_id` and `agent_id` a subagent's PostToolUse payload carries, whether `CLAUDE_CODE_SESSION_ID` differs inside a subagent, and whether the holder's signal file was written by the subagent. Then decide whether the detector should stay quiet when the holder's session equals the reporter's (same process, different agent) and say so, or name the agent.

## Acceptance criteria

- [ ] The payload fields a subagent's hook receives are measured and written on this card
- [ ] A change made by a subagent inside a scope its parent session holds is either not reported to the parent or reported with the agent named — decided from the measurement
- [ ] The existing detector test gains the same-session case
