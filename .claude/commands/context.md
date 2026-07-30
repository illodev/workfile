<!-- workfile:begin kind=claude-command-context version=0.7.0-rc.4 digest=sha256:571709220a7229576e13ec15d2eddf88641002f0baad78d83ba21d0436d942aa -->
---
description: Load the protocol context for a card
argument-hint: [T-0042]
allowed-tools: Bash(workfile agents context *)
---

!`workfile agents context --card $1 --limit 20`

The bundle above is the relevant slice of the workspace: the card,
its direct relations, active conventions, open incidents and
unexpired context. Read it before touching anything.
<!-- workfile:end -->
