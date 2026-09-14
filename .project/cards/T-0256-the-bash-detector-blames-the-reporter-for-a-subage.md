---
id: T-0256
title: The Bash detector blames the reporter for a subagent's own change
status: done
type: bug
priority: medium
area: core
source: .project/docs/research/DOC-0007-field-report-a-consuming-agent-on-0-13-0-relayed-2026-09-12.md
related: [DOC-0007, T-0227]
raised: derived
produced_by:
  model: undeclared
  reasoning: xhigh
  basis: self-reported
created: 2026-09-12
updated: 2026-09-14
scope: [packages/workfile/src/runtime/claude, packages/workfile/test, plugins/workfile/runtime, packages/workfile/docs/mcp.md]
verified:
  at: "2026-09-14T20:39:25.245Z"
  method: manual
  commit: fca9c8e415bdd59aaa7ce57c244fdcd4242f9327
  digest: "sha256:b9f1df19b6b485cbb82ecf97d9a4a8acdc24b432e563cd1367c5cd890eb5bac6"
---

A consuming agent reports the PostToolUse detector working — right actor, right `claimed_by`, the event in `events.jsonl` — and one false positive: its subagents run inside its session, so a change made by the claim holder itself through the CLI was reported to the parent as «most likely yours».

What the detector does today (T-0227): after a `Bash` call it walks the scopes *other* actors hold, and says «silent in that window» or «may be theirs» depending on whether the holder's session file signalled inside the window. Two things it cannot see, and both are in play here. A subagent's hook payloads may carry the parent's `session_id` with an `agent_id` beside it — the hook ignores `agent_id`, so a subagent and its parent are one session to the ledger and one actor to the guard, and a change either of them makes inside a scope the other holds is attributed to whoever's `Bash` finished last. And a CLI write into `.project` is never scanned, so the reported change was outside the protocol root, made by a process the ledger could not tell from the reporter.

To measure before designing: what `session_id` and `agent_id` a subagent's PostToolUse payload carries, whether `CLAUDE_CODE_SESSION_ID` differs inside a subagent, and whether the holder's signal file was written by the subagent. Then decide whether the detector should stay quiet when the holder's session equals the reporter's (same process, different agent) and say so, or name the agent.

## Acceptance criteria

- [x] The payload fields a subagent's hook receives are measured and written on this card
- [x] A change made by a subagent inside a scope its parent session holds is either not reported to the parent or reported with the agent named — decided from the measurement
- [x] The existing detector test gains the same-session case

## Activity

- 2026-09-14 19:49Z illodev@local#a112f2f3 via:undeclared/xhigh · claimed
- 2026-09-14 20:01Z illodev@local#a112f2f3 via:undeclared/xhigh · doing → review
- 2026-09-14 20:39Z illodev@local#a112f2f3 via:undeclared/xhigh · review → done

## Notes

- 2026-09-14 19:55Z illodev@local#a112f2f3 via:undeclared/xhigh — Measured on 2026-09-14 in a live Claude Code CLI session (agent-teams flag set) with a temporary payload dump added to the built hook — dist only, restored afterwards — and two subagents. PostToolUse fires for a subagent's tool calls: all four calls of a general-purpose subagent (three Bash, one Read) were captured, and the WebFetch calls of a claude-code-guide subagent too. A subagent's payload carries session_id equal to the parent's and transcript_path equal to the parent's, plus two keys a parent payload never has: agent_id (the subagent's own id) and agent_type (general-purpose, claude-code-guide). It lacks effort, which every parent payload carries. The environment does not separate them: CLAUDE_CODE_SESSION_ID is the parent's id both in the hook process and in the subagent's own Bash, CLAUDE_CODE_CHILD_SESSION=1 is set on both sides, and only CLAUDE_EFFORT is absent on the subagent's. Consequences, measured: workfile agents whoami inside the subagent answers the parent's actor (illodev@local#a112f2f3), so a claim a subagent makes through the CLI is the parent session's claim; the subagent's Read landed in events.jsonl under the parent's sessionId; and there is one session file, which the subagent's calls keep signalling. A subagent and its parent are one session to the ledger and one actor to the guard, and only agent_id tells them apart. Caveat: in a first run the hooks of the first subagent's two calls and of several parent calls issued in parallel around the probe's installation left no entry; the second run captured every call.
- 2026-09-14 19:56Z illodev@local#a112f2f3 via:undeclared/xhigh — Where the consumer's false positive came from, measured on 2026-09-14 in the consuming repository's own ledger (read only): events.jsonl holds 2445 events and exactly 2 collisions, and both name a holder written as a bare name — no user@host, no session tail, the shape an explicit --actor produces — with holderActive false. A claim like that has no session on the board, so separatesFromMe compares actor strings and the claim is foreign even to the session that made it; and no session file ever signals as that name, so 'silent in that window' is guaranteed and the report says 'most likely yours' about evidence that cannot say anything. The subagent was incidental: by the measurement above it shares the parent's session and actor, so a claim either of them makes with the default identity is never foreign to the other. Claude Code's documentation agrees on the payload: tool hooks fire inside subagents, and agent_id and agent_type are populated there (agent-sdk/hooks, Inputs); it does not say whether session_id is the parent's (measured: it is) and documents no environment variable that separates a subagent.
- 2026-09-14 20:01Z illodev@local#a112f2f3 via:undeclared/xhigh — Decided from the measurement and built on 2026-09-14. A subagent's change inside its parent session's scope is not reported: the subagent's payload carries the parent's session_id, so that scope is its own, and the new claude-surface test pins it by showing that keying on agent_id would have made it a collision. What the consumer actually hit is fixed in the same file: a holder no session file signals as (a hand-typed --actor) is no longer called silent — the report says no session here signals as that name, so its silence proves nothing, and suggests claiming without --actor; a holder some session has signalled as keeps 'silent, so most likely yours', which the existing detector test now covers too. Every ledger line a subagent's call writes carries agentId and agentType, and a collision carries holderKnown. Verified live in this session with the rebuilt hook: the parent's Read landed as {tool: Read, path: package.json} with no agent fields, and a subagent's Read landed as {agentId: a3809b8704182bff4, agentType: general-purpose, tool: Read, path: README.md}. Residual, observed and not fixable here: in two of three live subagent runs, a subagent that ended immediately after its tool call left no hook trace for it, while one that kept working left every call — consistent with Claude Code dropping a finishing subagent's pending async hooks, so a subagent's last command can go unreported. claude-surface 25/25; the full suite 536/536.
- 2026-09-14 20:39Z illodev@local#a112f2f3 — manual verification: Verified against @illodev/workfile@0.13.2 as published on npm: the installed tarball's dist/src/runtime/claude/hooks.mjs is byte-identical to the source that was verified live in a Claude Code session on 2026-09-14, where the rebuilt hook wrote a subagent's Read to events.jsonl as {agentId: a3809b8704182bff4, agentType: general-purpose, tool: Read, path: README.md} and the parent's Read with no agent fields. The hand-typed-holder wording, holderKnown and the same-session case are pinned by claude-surface.test.ts, which passed on all six CI configurations for 3a6a102 and fca9c8e.
