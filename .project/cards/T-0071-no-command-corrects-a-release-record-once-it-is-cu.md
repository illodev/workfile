---
id: T-0071
title: No command corrects a release record once it is cut
status: done
type: bug
priority: low
area: core
tags: [changelog, cli]
created: 2026-07-31
updated: 2026-08-02
scope: [packages/workfile/src/modules/changelog/changelog.ts]
---
Found while cutting 0.2.0. The release was dated 2026-08-01 — correct in the
maintainer's timezone, an hour ahead of UTC — and `doctor` immediately flagged
`release-date-in-future`, which compares against UTC. So the record was wrong
and the tool that wrote it had no way to fix it:

```
$ workfile changelog patch REL-0010 --json-input date.json
CHANGE_FRAGMENT_NOT_FOUND: Unreleased changelog fragment not found: REL-0010
```

`changelog patch` only reaches unreleased fragments. A release record is
writable by the tool exactly once, at `changelog release`, and never again.
The recovery was `git checkout` over the cut and a second `changelog release`
with the right date — which works only because the cut had not been committed
yet, and only because the operator is holding the repository. Neither is true
of an agent following the protocol.

## Two defects, one symptom

1. **No write path.** Every other record kind has a patch command. Releases
   are the exception, and a typo'd title or a wrong date is unreachable.
2. **The error is wrong about what happened.** `CHANGE_FRAGMENT_NOT_FOUND`
   says REL-0010 does not exist. It does exist; it is simply not a fragment.
   The caller is told to look for a missing file rather than that they aimed
   a fragment command at a release.

The second is the cheaper fix and the one that matters more day to day — the
same class as [[T-0055]], where an error computed what the caller needed and
printed only part of it.

## Decided: `changelog release VERSION --amend`

The newest release only, ordered by allocation rather than by date — the date
is the field most likely to be the thing being corrected, so ordering by it
would be circular. Once a later release exists the earlier one is settled, and
the correction is a new fragment saying so.

Amendable: `title`, `date`, `commit`, `body`, `tags`. Not `version`, which is
the record's identity and its directory name, and not `fragments`, which is
what the cut decided — rewriting it detaches the record from the files it
consumed. A general `patch` reaching releases was the alternative and was
rejected: history editable anywhere is a weaker record, and the case this
serves is the minutes after a cut, not archaeology.

## The error, and a third defect found while fixing it

Four cases used to answer `CHANGE_FRAGMENT_NOT_FOUND`. They now answer for
themselves: a release aimed at with a fragment command is
`CHANGE_RECORD_NOT_A_FRAGMENT` and resolves a bare version too, a fragment
already cut is `CHANGE_FRAGMENT_RELEASED` and names the version that froze it,
and a genuine absence keeps the original code.

The third defect was mine, in the first draft. The CLI branch spread
`{ title: option("--title") }` with no `--title` given, and `patchFrontmatter`
reads an explicit empty as a removal — so redating a release deleted its title
and left a record failing `doctor` on a rule the amendment itself introduced.
Fixed in the branch, and closed in the module too: an empty value is a value
that was not given, and the required keys are re-checked against the rewritten
frontmatter before the write lands.

## Acceptance criteria

- [x] A release cut with the wrong date can be corrected without reaching for git
- [x] Only the newest release is amendable, and the refusal names the one after it
- [x] `version` and `fragments` are refused
- [x] A fragment command aimed at a release says so instead of reporting it missing
- [x] An amendment cannot leave a release without a required field

## Activity

- 2026-08-02 00:59Z illodev@local#e55eab30 · claimed
- 2026-08-02 00:59Z illodev@local#e55eab30 · doing → review
- 2026-08-02 01:13Z illodev@local#e55eab30 · review → done

