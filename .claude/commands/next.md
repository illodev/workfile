<!-- workfile:begin kind=claude-command-next version=0.7.0-rc.4 digest=sha256:6dd14e920502fbfad5746c9b67ed7542bc67bb9f5a2049c531771df6ae50839c -->
---
description: Show the cards that can be started right now
allowed-tools: Bash(workfile card list *)
---

Run `workfile card list --unclaimed --status next,backlog --limit 10 --json`
and show the candidates with their priority and area.

Do not start work without claiming: `/claim <id>`.
<!-- workfile:end -->
