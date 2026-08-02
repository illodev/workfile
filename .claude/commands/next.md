<!-- workfile:begin kind=claude-command-next version=0.4.0 digest=sha256:7511d96f02072202f9fea38379814c1e61283fd205d47796276f4d6a9254a2d0 -->
---
description: Show the cards that can be started right now
allowed-tools: Bash(pnpm workfile card list *)
---

Run `pnpm workfile card list --unclaimed --status next,backlog --limit 10 --json`
and show the candidates with their priority and area.

Do not start work without claiming: `/claim <id>`.
<!-- workfile:end -->
