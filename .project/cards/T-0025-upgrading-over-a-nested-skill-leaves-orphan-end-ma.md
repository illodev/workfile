---
id: T-0025
title: Upgrading over a nested skill leaves orphan end markers behind
status: backlog
type: bug
priority: low
area: core
created: 2026-07-30
updated: 2026-07-30
---
## Context

Skills written by 0.1.0/0.1.1 carried the nested-marker defect (fixed in 9ee0f6c): the
body embedded the protocol's own `workfile:begin`/`workfile:end` pair. When 0.1.2's
`claude install` runs over such a file, `mergeManagedBlock` replaces from the outer
`begin` to the FIRST `end` — the inner one — and every marker line beyond that range
survives as debris:

```
1:  <!-- workfile:begin kind=claude-skill version=0.1.2 ... -->
80: <!-- workfile:end -->      <- the block's real end
81: <!-- workfile:end -->      <- orphan, from the old nested layout
82: <!-- workfile:end -->      <- orphan
```

Each re-install over the dirty file adds nothing new but never sweeps the tail either;
this repo's own SKILL.md had accumulated SEVEN orphan ends, Fube's had two. `claude
check` reads the first block, digests it correctly and reports **current**, so the
debris is invisible to every existing check.

## Why it matters

Any consumer that installed the Claude surface on 0.1.0/0.1.1 and upgrades hits this.
The orphan lines are HTML comments (invisible when rendered), but they are wrong bytes
in a generated file, they confuse any future parser change, and no tool ever removes
them.

## Proposed fix

After `mergeManagedBlock` places the block, sweep marker lines that fall OUTSIDE any
complete block: an `end` without a matching `begin` is never legitimate user content.
`stripManagedMarkers` (managed-files.ts) already knows the syntax — apply it to the
regions outside the merged block. Test: write a nested-era file, sync over it, assert
exactly one begin and one end survive.

## Notes

- 2026-07-30 — found while upgrading Fube to 0.1.2; both repos cleaned by hand
  (sed dedup of trailing ends; `claude check` stays current). Same defect family as the
  nesting bug fixed in 9ee0f6c.
