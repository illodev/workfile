---
id: T-0094
title: Verify compaction restores the brief, and wire PreCompact if not
status: done
type: task
priority: low
area: core
created: 2026-08-01
updated: 2026-08-02
scope: [.project/cards]
---
[[T-0090]] widened the `SessionStart` matcher to `*`, so whatever source the
host sends on compaction now reaches the handler. Whether it sends one at all
was the open question, and one session settled it.

## Settled: the source is `compact`, and `*` already covers it

Session `e55eab30` compacted five times and spans the fix, so it is a natural
experiment rather than a single observation. Read out of the host's own
transcript, matching `hook_success` attachments against `compactMetadata`
entries:

| compaction | matcher at the time | hook event |
|---|---|---|
| 2026-07-31 22:21:49 | `startup\|resume\|clear` | none |
| 2026-08-01 11:44:10 | `startup\|resume\|clear` | none |
| 2026-08-01 18:00:14 | `startup\|resume\|clear` | none |
| 2026-08-01 20:21:07 | — `workfile claude sync` writes `*` — | |
| 2026-08-01 20:32:39 | `*` | `SessionStart:compact` |
| 2026-08-01 23:38:00 | `*` | `SessionStart:compact` |

The host emits `SessionStart` with source `compact`, in the same second as the
compaction, every time. Three compactions before the sync produced nothing and
both after it produced the hook. The board is rebuilt and the brief re-injected
without anything further being built.

All five triggers read `manual`, so auto-compaction is still unobserved. The
trigger is compaction metadata and the source is the event class, so the same
`compact` source is expected either way — but that part is inference, not
evidence, and is recorded as such.

## PreCompact must not be wired

This is the useful half of the answer. The second pass talked us out of the
steal-list item that proposed a `PreCompact` hook, and it was right for a
reason nobody had confirmed: `SessionStart:compact` already fires, so adding
`PreCompact` would inject the brief twice on every compaction. The card is
closed by evidence against building the thing it was opened to consider.

Recorded as [[LRN-0007]], because the next person to notice a lost board will
reach for `PreCompact` the same way.

## Acceptance criteria

- [x] A real compaction's hook payload is captured and recorded here
- [x] The board is proven to return after a compaction, or PreCompact is wired
- [x] If PreCompact is wired, nothing injects the brief twice

## Activity

- 2026-08-02 00:47Z illodev@local#e55eab30 · doing → review
- 2026-08-02 01:13Z illodev@local#e55eab30 · review → done

