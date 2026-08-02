---
description: "Finish a card: verify, record, release"
argument-hint: "[T-0042]"
allowed-tools: "Bash(npx workfile card transition *), Bash(npx workfile changelog add *), Bash(npx workfile doctor *)"
---

Close out `$1`:

1. `npx workfile doctor --severity error` must be clean.
2. Add a changelog fragment if the change is user-visible.
3. `npx workfile card transition $1 review` — `review` means verification
   is pending. Only move to `done` with runtime evidence: a passing
   test, a command whose output you have seen, a screenshot.

Record anything durable you learned with `npx workfile memory add`.
