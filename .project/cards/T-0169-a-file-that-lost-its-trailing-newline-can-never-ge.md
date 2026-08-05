---
id: T-0169
title: A file that lost its trailing newline can never get it back
status: backlog
type: bug
priority: medium
area: core
tags: [managed-files, field-report]
origin: [DOC-0005]
created: 2026-08-05
updated: 2026-08-05
---

[[DOC-0005]] (finding 4) reports that 0.5.4 stopped writing a trailing newline
into five generated files, and reads it as a regression in the generator. The
generator is fine now — a workspace created from scratch at 0.6.0 ends every
one of them at `0a`. The defect is that the repair cannot reach a file that
already lost it.

Stripping the newline from a healthy file and re-running the install:

```
after stripping newline: 2e
  unchanged  .claude/commands/claim.md
after re-running claude install: 2e

$ workfile claude check
Claude Code surface: 7 current, 0 to sync
  current    .claude/commands/claim.md
```

`renderManagedBlock` (`modules/generated/managed-files.ts:149`) digests
`String(body || "").trimEnd()`. The trailing byte is therefore outside what the
digest covers, `mergeManagedBlock` reproduces the file it was given,
`syncManagedFile` computes `before === after` and reports `unchanged`, and
`inspectManagedFile` reports `current`. Nothing in the surface can see the
difference, so nothing can fix it.

This checkout is in that state. Its four `.claude/commands/*.md` end at `2e`
today, at 0.6.0, having been regenerated as recently as eb2d475 — the header
says `version=0.6.0` and the last byte is still wrong. `claude check` calls all
seven current. The report found this the way anyone will: git marks
`\ No newline at end of file`, the content shifts one character, and a line
that is identical to the eye shows as modified.

`trimEnd()` is not obviously wrong — it is what makes the digest stable against
an editor adding or removing a blank line at the end, which is a real thing
editors do. So the fix is not simply to stop trimming. The file's final byte
has to be normalised on write regardless of what the digest covers, and a file
that ends without one has to be reported as stale even though its digest
matches.

The second half is the part that matters beyond this bug: a health check that
reports `current` for a file it cannot fully compare will hide the next one of
these too.

## Acceptance criteria

- [ ] A managed file whose trailing newline was removed is rewritten with it
- [ ] `claude check` reports that file as stale rather than current
- [ ] The digest stays stable against trailing blank lines, as it is now
- [ ] This repository's own `.claude/commands/*.md` end in `0a`
