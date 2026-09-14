---
id: CHG-0194
title: The Bash detector stops calling a hand-typed holder silent, and names the agent
type: fixed
area: core
visibility: public
cards: [T-0256]
created: 2026-09-14
updated: 2026-09-14
---

After a `Bash` call the hook reports files that changed inside a scope another actor holds, and says whether the holder's session was signalling in that window. A claim made with a hand-typed `--actor` matches no session file, so its holder was silent in every window by construction and the report called the change "most likely yours" — including to the session that had made the claim. It now says that no session here signals as that name, so the silence proves nothing, and suggests claiming without `--actor`; the ledger's `collision` object gains `holderKnown`.

Measured in a live Claude Code session: a subagent's tool calls fire the same hooks with its parent's `session_id`, plus `agent_id` and `agent_type`, so a subagent's change inside its parent session's scope is not a collision. Every ledger line a subagent's call writes now carries `agentId` and `agentType`.
