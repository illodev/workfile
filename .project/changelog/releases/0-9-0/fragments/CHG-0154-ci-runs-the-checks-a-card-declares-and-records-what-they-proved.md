---
id: CHG-0154
title: CI runs the checks a card declares and records what they proved
type: added
area: infra
visibility: public
cards: [T-0189, T-0161]
created: 2026-08-07
updated: 2026-08-07
---

A card may bind an acceptance criterion to a command, and the generated GitHub workflow now runs those commands for every card a branch touched and writes the result back. Two jobs, because they cannot be one: the job that runs commands a pull request declared holds no permissions at all, and the job that holds a write token runs no repository code. A fork records nothing, which GitHub enforces by issuing a read-only token. And CI closes a card only when every one of its criteria is bound to a command, because a narrative criterion is not something a runner has an opinion about.
