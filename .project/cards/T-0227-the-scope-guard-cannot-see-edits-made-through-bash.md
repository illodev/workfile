---
id: T-0227
title: The scope guard cannot see edits made through Bash
status: done
type: bug
priority: medium
area: core
raised: derived
created: 2026-09-02
updated: 2026-09-11
scope: [packages/workfile/src/runtime/claude/hooks.mjs, packages/workfile/src/modules/claude/surface.ts, packages/workfile/test/claude-surface.test.ts, packages/workfile/docs/mcp.md]
verified:
  at: "2026-09-11T18:13:28.265Z"
  method: manual
  commit: fa21262d17b83d8ddc141e717a8096f5c559578d
  digest: "sha256:c18711f661cc0ad2510b5186f82a9614637b91f3784259b355efcfed5fb63306"
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

## Decided and built

A detector in `PostToolUse`, not a guard (owner, 2026-09-11). After a `Bash` call the hook
walks the scopes *other* actors hold — bounded to 4000 entries, never into `.git`,
`node_modules` or `.project` — and takes every file whose mtime falls after this session's
previous signal and that no typed-tool write in the ledger accounts for. Each hit is appended
to `events.jsonl` with a `collision` object (card, holder, kind, window, whether the holder
was signalling), added to the session's `filesTouched`, and reported to the agent as
`additionalContext`. The hook stays `async`, and Claude Code delivers an async hook's output
with the **next** tool result, one call late — measured live, see the notes. `PreToolUse` is
untouched and still does not match `Bash`.

The window is the whole command, so a neighbour writing to their own scope through `Bash` at
the same moment lands in it: the text says "changed while your command ran", never "you
changed", and names whether the holder's session signalled in that window. Residual, and
stated in the runtime: a neighbour's own `Bash` edits are recorded by nobody, so that case can
be informed but not settled.

## Acceptance criteria

- [x] A `Bash` call that changes a file inside another actor's claimed scope, with no
      `file_path` in the payload, produces a `PostToolUse` report naming the path, the card
      and its holder, and a `collision` line in `events.jsonl`.
- [x] A file the ledger attributes to a typed write (`Edit`, `Write`, `NotebookEdit`) in the
      same window is not reported, and a `Read` of it does not hide the edit.
- [x] Files inside this session's own scope, or outside every scope, are never reported; a
      deletion inside a foreign scope surfaces as the directory that lost the entry.
- [x] The same change is not reported twice, and a command that changed nothing says nothing.
- [x] `PreToolUse` still does not match `Bash` — `claude-surface.test.ts` pins
      `!covers(guard, "Bash")` — and its budget test is unaffected.
- [x] Observed in a live Claude Code session: the report reaches the agent and the ledger
      holds the collision.

## Notes

- 2026-09-11 17:32Z illodev@local#597ecdc9 — Decided by the owner on 2026-09-11: a detector in PostToolUse, not a guard. After a Bash tool call it compares the files the command touched (git status / mtime under the workspace) with the scopes other actors hold, writes the collision as an event and returns an additional-context warning to the agent. It reports after the fact instead of preventing, and it never joins the PreToolUse matcher, whose hot-path budget stays as claude-surface.test.ts pins it.
- 2026-09-11 18:12Z illodev@local#597ecdc9 — Live evidence, this Claude Code session on 2026-09-11 (hook installed from node_modules → packages/workfile symlink, dist rebuilt with the detector): a foreign claim was staged in the board cache only (.project/.cache is gitignored; card id T-9999, holder agent-other, scope scratch-probe — not a record). A printf into scratch-probe/probe.txt at 18:10:59Z and a sed -i on it at 18:11:04Z each appended one collision line to events.jsonl (since 18:09:00.929Z and 18:10:59.176Z, kind file, holderActive false) and the path entered the session's filesTouched. Both reports reached the agent as additionalContext, each with the tool result of the following call: Claude Code delivers an async hook's output one call late. A third, read-only call wrote no line and produced no report. Tests: claude-surface.test.ts 'an edit made through Bash inside another actor's scope is reported after the fact' (23/23 in file), full suite 522/522, strict ratchet held at 424.
- 2026-09-11 18:12Z illodev@local#597ecdc9 — Fube's bench (scripts/workfile-guard-cases.mjs) case 12 stays as written: it drives pre-tool-use with a Bash payload and expects silence, and PreToolUse is still silent by design. The conformance case for this fix drives post-tool-use with tool_name Bash after changing a file inside a foreign scope and expects additionalContext plus a collision line in events.jsonl; Fube can add it once it upgrades past 0.12.0 and retire the 'measured defect' marker on case 12.
- 2026-09-11 18:13Z illodev@local#597ecdc9 — manual verification: Live in this Claude Code session on 2026-09-11 with the installed hook: a printf and a sed -i inside a staged foreign scope each wrote a collision line to .project/.cache/activity/events.jsonl (18:10:59Z and 18:11:04Z, holderActive false) and both reports reached the agent as additionalContext one call later; a read-only call wrote nothing. claude-surface.test.ts 23/23, full suite 522/522, doctor clean.

## Activity

- 2026-09-11 18:02Z illodev@local#597ecdc9 · claimed
- 2026-09-11 18:13Z illodev@local#597ecdc9 · doing → done
