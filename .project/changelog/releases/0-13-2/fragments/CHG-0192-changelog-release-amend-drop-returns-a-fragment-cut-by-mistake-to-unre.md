---
id: CHG-0192
title: changelog release --amend --drop returns a fragment cut by mistake to unreleased
type: added
area: core
visibility: public
cards: [T-0253]
created: 2026-09-14
updated: 2026-09-14
---

A fragment cut into a release by mistake — a duplicate, say — had no exit but undoing the cut with git. `changelog release VERSION --amend --drop CHG-…` now moves the fragment's file back to `unreleased/`, removes its id from the newest release and rewrites a rendered changelog that exists; `amendRelease(workspace, version, { drop })` does the same for a library caller. An id whose file is already gone is only taken off the list, which repairs `release-missing-fragment`. A release keeps at least one fragment, and only the newest release can be amended, as before.

`--amend` no longer accepts `--fragments` and ignores it: it refuses with `RELEASE_FIELD_NOT_AMENDABLE` and names what it can change. `--drop` without `--amend` is refused with `RELEASE_DROP_REQUIRES_AMEND`.
