---
id: T-0071
title: No command corrects a release record once it is cut
status: backlog
type: bug
priority: low
area: core
tags: [changelog, cli]
created: 2026-07-31
updated: 2026-07-31
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

## Worth deciding

A released record is history, and history that can be patched silently is a
weaker record. `changelog release --amend`, refusing to touch anything already
tagged, may be the honest shape rather than a general `patch`.
