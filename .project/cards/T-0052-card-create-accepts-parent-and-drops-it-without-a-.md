---
id: T-0052
title: card create accepts --parent and drops it without a word
status: backlog
type: bug
priority: high
area: core
source: .project/docs/research/DOC-0001-fube-session-feedback-verified-triage.md
tags: [fube-feedback, cli, silent-failure]
scope: [packages/workfile/bin/workfile.ts]
created: 2026-07-31
updated: 2026-07-31
---

`--parent` is listed in `COMMAND_FLAGS.card` (`bin/workfile.ts:212`), so
`assertKnownFlags` waves it through. The `create` branch (`:714-731`) never reads
it — only the `list` filter does (`:464`). The card is written without a parent
and the command exits 0.

Reproduced in a throwaway workspace:

```
$ workfile card create --title "Child with parent flag" --parent T-0001
T-0002 T-0002-child-with-parent-flag.md
$ head -8 .project/cards/T-0002-*.md      # no parent: line
```

`createCard` itself handles `parent` correctly
(`src/modules/cards/mutations.ts:279`); only the flag wiring is missing.

This is the exact failure mode the comment above `assertKnownFlags` says the
project refuses: unknown flags are rejected rather than ignored, "which is worse
than failing because the caller believes the filter was applied." A hierarchy
built this way is silently flat, and nothing downstream reports it.

## Scope

Wire `--parent` into the `create` input map. While there, close the rest of the
gap between the flag surface and what `createCard` accepts: `--source`,
`--depends`, `--milestone`, `--effort`, `--related`, `--start`, `--due` are all
supported by the mutation and unreachable from flags.

A regression test should assert that every key `createCard` reads is either
wired to a flag or absent from `COMMAND_FLAGS.card` — the drift, not just this
instance.
