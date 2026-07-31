<!-- workfile:begin kind=claude-command-claim version=0.1.9 digest=sha256:71792291180e6ac360b4608379bad262853128c4a110810b1453013bb12b85f7 -->
---
description: Claim a card before working on it
argument-hint: [T-0042] [scope,paths]
allowed-tools: Bash(pnpm workfile card claim *)
---

Claim `$1` with `pnpm workfile card claim $1 --scope $2`.

The scope is the set of paths you intend to modify. It is what stops
two agents from editing the same files, so name it honestly — too
wide blocks other work, too narrow defeats the point.

If the card is already claimed by someone else, stop and report it
rather than forcing: the other claim may be a live session.
<!-- workfile:end -->
