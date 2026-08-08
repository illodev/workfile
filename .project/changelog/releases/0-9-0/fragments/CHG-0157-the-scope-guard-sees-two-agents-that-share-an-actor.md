---
id: CHG-0157
title: The scope guard sees two agents that share an actor
type: fixed
area: core
visibility: public
cards: [T-0219]
created: 2026-08-07
updated: 2026-08-07
---

A claim board entry carries the session behind its claim, so the guard no longer has to recover one from the actor's tail — which a `claimed_by` written from an explicit `--actor` does not have. Two agents handed the same actor saw a string equal to their own and the guard stayed silent; it prompts now. The session that holds a claim is still free to work, and two session-free terminals sharing one actor are still left alone, because unproven is not a verdict.
