---
# workfile kind=claude-command-next version=0.4.0 digest=sha256:26a73ffdf0aa92081f3cab88e0630e202d86d9890081fbcc4e8c836e08ef489f
description: "Show the cards that can be started right now"
allowed-tools: "Bash(pnpm workfile card list *)"
---

Run `pnpm workfile card list --unclaimed --status next,backlog --limit 10 --json`
and show the candidates with their priority and area.

Do not start work without claiming: `/claim <id>`.
