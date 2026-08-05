---
id: CHG-0118
title: A generated file that lost its trailing newline can be repaired
type: fixed
area: core
visibility: public
created: 2026-08-05
updated: 2026-08-05
---
An external field report read the missing newline in five generated files as a
regression in the generator. It is not: a workspace created from scratch at
0.6.0 ends every one of them at `0a`. The defect is that the repair could not
reach a file that had already lost it.

The block digest is taken over `trimEnd()`-ed bytes, deliberately — that is
what keeps a file stable when an editor adds or drops a blank line at the end.
The cost was that the last byte sat outside the comparison entirely. A file
that lost it merged back into itself, the write path saw `before === after` and
reported `unchanged`, and `check` reported `current`. Nothing in the surface
could see the difference, so nothing could fix it. This repository was in that
state, at 0.6.0, with `version=0.6.0` in the marker of every affected file.

The byte is settled beside the digest now rather than inside it: normalised on
every write, and asserted separately on read.

**The report says which comparison failed** — `style`, `body`, `digest` or
`trailing-newline`. That is the half that outlives this bug. `stale` on a file
whose digest agrees is what sent the report looking at the generator, and a
check that reports `current` for a file it cannot fully compare will hide the
next one of these too.

```
$ workfile claude check
Claude Code surface: 2 current, 5 to sync
  stale      .claude/commands/next.md  (trailing-newline)
  stale      .claude/skills/workfile/SKILL.md  (trailing-newline)
```

**On upgrade, files in that state report stale once.** One `workfile claude
install` or `workfile agents sync` settles it, and the diff is one byte per
file. The digest is still stable against a trailing blank line, which is why it
trims in the first place.
