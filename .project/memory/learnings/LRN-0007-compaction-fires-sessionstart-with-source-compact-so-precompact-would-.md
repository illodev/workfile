---
id: LRN-0007
title: Compaction fires SessionStart with source compact, so PreCompact would double-inject
status: active
related: [T-0090, T-0094]
scope: [packages/workfile/src/modules/claude/surface.ts, packages/workfile/src/runtime/claude/hooks.mjs]
created: 2026-08-02
updated: 2026-08-02
---

Claude Code emits `SessionStart` on context compaction with source `compact`,
in the same second as the compaction. Measured across five compactions of one
session that spans the matcher change: three under `startup|resume|clear`
produced no hook at all, and both after `claude sync` wrote `*` produced
`SessionStart:compact`.

The consequence that matters is negative. A lost claims board after compaction
looks exactly like a missing `PreCompact` hook, and that is the wrong reach:
`SessionStart` already fires, so wiring `PreCompact` at `agents context` would
inject the brief twice on every compaction. The narrow matcher was the whole
defect, and `*` is the whole fix.

The evidence is in the host's own transcript rather than in anything Workfile
writes: `hook_success` attachments carry `hookName: "SessionStart:<source>"`,
and `compactMetadata` marks the compaction. Workfile's session signal records
that a session is alive, not which event woke it, so this question cannot be
answered from `.project/.cache/activity` — a future check has to read the
transcript the same way.
