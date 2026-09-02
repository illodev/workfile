---
id: T-0233
title: doctor --fix cannot be scoped, and its own warning recommends it
status: backlog
type: bug
priority: medium
area: core
raised: reported
created: 2026-09-02
updated: 2026-09-02
---

`doctor --fix` renames every record whose filename no longer matches its title, across the whole
repository, and there is no way to narrow it. Reported before from fube-v2; this adds the two things
that make it worse than "missing a flag".

## 1. The warning recommends the command

Every `filename-stale` warning ends with:

```
Filename no longer matches the title; `doctor --fix` renames it to <name>
```

In fube-v2 that message is printed **67 times per run**. The project's own rules forbid the command
outright — eight agents work the repository concurrently and on 2026-08-27 one of them ran it for a
card of theirs and moved **63 belonging to other sessions**, all mid-retitle and uncommitted. So the
tool prints, sixty-seven times a day, an instruction the project has banned.

A `--only <id>` (or honouring `--dry-run`, which it currently ignores) would make the advice
followable. `reslugStaleRecordFiles` already filters by `kinds`, so an id filter is the same place.

## 2. Renaming silently breaks path references, and nothing warns

Records link by id (`[[T-1234]]`), which survives a rename. But `source:` fields and many document
links cite the **path**. Measured in fube-v2 on 2026-09-02, on the first stale record in the list:

> Renaming `ADR-0001` would break **9 references** to the old filename — two of them inside a
> read-only imported tree, so unfixable.

`--fix` would move all 67 and say nothing about any of it. Whatever scoping lands, the honest
behaviour is to **report the references before moving**, because the right answer is often *do not
rename*: a stale filename is cheaper than nine dead links.

A local wrapper now does this a record at a time (`scripts/ops/workfile-rename.sh`): it reads the
destination out of doctor's own message, refuses when the old basename is cited anywhere, and moves
with `git mv`. That it had to be written outside is the report.

## Acceptance criteria

- [ ] `doctor --fix` can be limited to one or more ids
- [ ] `doctor --fix --dry-run` prints the `from → to` list without writing
- [ ] Before renaming, references to the old filename are reported
- [ ] The `filename-stale` message does not recommend a repository-wide rewrite as the only remedy
