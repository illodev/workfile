---
id: CHG-0164
title: The stale-filename warning names the scoped fix, not the workspace-wide one
type: fixed
area: core
visibility: public
created: 2026-09-03
updated: 2026-09-03
---

The warning said `doctor --fix` renames it to X, which reads as the remedy for the one record it names and is not: plain `--fix` renames every stale filename in the workspace. On one consuming repository, with seven other agents editing records, somebody ran it because the warning recommended it and it moved 63 records belonging to other people — some retitled and uncommitted, where the rename is not recoverable from git.

It now names `--fix --only <ID>` and says what the unscoped form does.

And `doctor --fix --dry-run` previews the renames without writing, naming for each one the records whose Markdown links point at the old filename — the links a rename breaks, as opposed to an id-based one, which survives. It previews the rename only and says so: the other two repairs are named as not previewed rather than silently skipped. On that same repository the preview reports 63 renames and 34 of them with references that would break, writing nothing.
