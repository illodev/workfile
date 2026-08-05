---
id: CHG-0130
title: A forced transition records which gate it walked past, and why
type: changed
area: core
visibility: public
cards: [T-0184]
tags: [protocol, acceptance]
created: 2026-08-05
updated: 2026-08-05
---

`--force` skipped the acceptance gate and left no trace: `review → done` was the same trail line whether the criteria were proven or waived, so every count taken over closed cards counted both alike.

A forced move now names the gate it waived and carries the reason on the same entry:

```text
- 2026-08-05 11:04Z alice@studio · review → done (forced past 3 unproven criteria: the last two need hardware CI does not have)
```

The reason is required, on all four doors — `card transition`, `card patch`, `card release --status done` and the HTTP and MCP surfaces — but only when `force` actually waives something: a `--force` that nothing refused records nothing and asks for nothing, so `card reap` is unaffected. Taking another actor's claim is written the same way, which is what `project_card_release` has advertised its `reason` did since it was written, while the signature it called dropped it.
