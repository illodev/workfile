<!-- workfile:begin kind=claude-command-context version=0.4.0 digest=sha256:4db7ba53833f4d5886cf8ddbc9173df7ab795773d719f5cafdf1e177616d7ee3 -->
---
description: "Load the protocol context for a card"
argument-hint: "[T-0042]"
allowed-tools: "Bash(pnpm workfile agents context *)"
---

!`pnpm workfile agents context --card $1 --limit 20`

The bundle above is the relevant slice of the workspace: the card,
its direct relations, active conventions, open incidents and
unexpired context. Read it before touching anything.
<!-- workfile:end -->
