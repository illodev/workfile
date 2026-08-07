---
# workfile kind=claude-command-done version=0.8.1 digest=sha256:8c5f5d74e6308e72f0f151dc444169322891ccd7e6330a79d3cdc397363e5d01
description: "Finish a card: verify, record, release"
argument-hint: "[T-0042]"
allowed-tools: "Bash(pnpm workfile card transition *), Bash(pnpm workfile changelog add *), Bash(pnpm workfile doctor *)"
---

Close out `$1`:

1. `pnpm workfile doctor --severity error` must be clean.
2. Add a changelog fragment if the change is user-visible.
3. `pnpm workfile card transition $1 review` — `review` means verification
   is pending. Only move to `done` with runtime evidence: a passing
   test, a command whose output you have seen, a screenshot.

Record anything durable you learned with `pnpm workfile memory add`.
