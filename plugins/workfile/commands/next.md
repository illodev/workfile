---
description: "Show the cards that can be started right now"
allowed-tools: "Bash(npx workfile card list *)"
---

Run `npx workfile card list --unclaimed --status next,backlog --limit 10 --json`
and show the candidates with their priority and area.

Do not start work without claiming: `/claim <id>`.
