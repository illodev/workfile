---
id: T-0227
title: The scope guard cannot see edits made through Bash
status: backlog
type: bug
priority: medium
area: core
raised: derived
created: 2026-09-02
updated: 2026-09-02
---

The `PreToolUse` scope guard is installed with matcher `Edit|Write|NotebookEdit`, and `preToolUse`
returns early at `if (!filePath) return`. A `Bash` payload carries `command`, not `file_path`.

So **an agent that writes with `sed`, a heredoc or `tee` inside a scope another agent has claimed
gets no prompt at all.** The protection is skipped by the very editing style that bypass mode
recommends.

## Measured, and it already collided

2026-09-01, Fube, eight panels live: `scripts/spanish-identifiers.php` was modified at **21:17:53**
while inside the scope `drain-api` held on its card, and it has **zero** events in
`.project/.cache/activity/events.jsonl`. That is precisely the collision the mechanism exists to
prevent. It happened, and it happened in silence.

Reproduced as case 12 of the Fube bench `scripts/workfile-guard-cases.mjs`, which drives the real
installed hook against a throwaway workspace. The case is marked as a **measured defect**, not a
pass, so the green cannot be read as conformance.

## What this card is NOT

"Add Bash to the matcher" is not the fix, and two things in this repo already say so:

- `claude-surface.test.ts` asserts by name that `PreToolUse` must stay off the hot path
  (`assert.ok(!covers(guard, "Bash"))`), reasoned in `surface.ts` against a p95 < 30 ms budget.
- And it would do nothing anyway: `preToolUse` exits on the missing `file_path`.

Extracting paths from a shell command line is also rejected here on principle, with the argument
written down in `validation.ts`: over a shell string no prefix matcher is sound.

## What has to be decided

Whether a coordination signal that only sees the typed-tool path is worth having, and what the Bash
path gets instead. Candidates: a **detector in `PostToolUse`** that reports collisions after the
fact instead of a guard that prevents them; or a per-panel watcher outside the package entirely.

Related: the guard also asks about the editor's **own** card, because `claim.session` is never
populated.
