<!-- workfile:begin kind=claude-command-context version=0.1.0 digest=sha256:1f6e0e751347297735f95bce3b0b72ccb6755b481cb8baca163d733799f93058 -->
---
description: Load the protocol context for a card
argument-hint: [T-0042]
allowed-tools: Bash(pnpm workfile agents context *)
---

!`pnpm workfile agents context --card $1 --limit 20`

The bundle above is the relevant slice of the workspace: the card,
its direct relations, active conventions, open incidents and
unexpired context. Read it before touching anything.
<!-- workfile:end -->
