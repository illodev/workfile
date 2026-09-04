---
# workfile kind=claude-command-claim version=0.10.0 digest=sha256:1a5ad0b0ff6e21b7d2d15a371a32232196365a8ce0d1d36a7bccde2e1e19d185
description: "Claim a card before working on it"
argument-hint: "[T-0042] [scope,paths]"
allowed-tools: "Bash(pnpm workfile card claim *)"
---

Claim `$1` with `pnpm workfile card claim $1 --scope $2`.

The scope is the set of paths you intend to modify. It is what stops
two agents from editing the same files, so name it honestly — too
wide blocks other work, too narrow defeats the point.

If the card is already claimed by someone else, stop and report it
rather than forcing: the other claim may be a live session.
