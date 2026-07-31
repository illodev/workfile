<!-- workfile:begin kind=claude-command-done version=0.1.6 digest=sha256:99c1db5622419c15a03fd4b36985340c89e5dc3e507d9a96f2189f5b70689440 -->
---
description: Finish a card: verify, record, release
argument-hint: [T-0042]
allowed-tools: Bash(pnpm workfile card transition *), Bash(pnpm workfile changelog add *), Bash(pnpm workfile doctor *)
---

Close out `$1`:

1. `pnpm workfile doctor --severity error` must be clean.
2. Add a changelog fragment if the change is user-visible.
3. `pnpm workfile card transition $1 review` — `review` means verification
   is pending. Only move to `done` with runtime evidence: a passing
   test, a command whose output you have seen, a screenshot.

Record anything durable you learned with `pnpm workfile memory add`.
<!-- workfile:end -->
