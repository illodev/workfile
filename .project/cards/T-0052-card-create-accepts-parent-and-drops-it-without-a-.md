---
id: T-0052
title: card create accepts --parent and drops it without a word
status: done
type: bug
priority: high
area: core
source: .project/docs/research/DOC-0001-fube-session-feedback-verified-triage.md
tags: [fube-feedback, cli, silent-failure]
scope: [packages/workfile/bin/workfile.ts, packages/workfile/test/cli.test.ts]
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

## Activity

- 2026-07-31 20:22Z session-fube-triage · claimed
- 2026-07-31 20:31Z session-fube-triage · doing → done

## Verification

- 2026-07-31 20:31Z session-fube-triage — Runtime: built dist run against a fresh `workfile init` workspace. `card create --title Child --parent T-0001 --tags a,b --effort M --due 2026-09-01` now writes `parent: T-0001`, `tags: [a, b]`, `effort: M`, `due: 2026-09-01`. Tests: 177 core + 7 search-local green; the new `card create reaches every field the mutation accepts` walks CARD_PATCHABLE_FIELDS, so a future patchable field without a create flag fails the suite. strict ratchet held at 647 known errors, none new.
