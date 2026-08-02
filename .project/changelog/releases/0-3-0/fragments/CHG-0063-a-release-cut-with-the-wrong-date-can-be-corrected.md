---
id: CHG-0063
title: A release cut with the wrong date can be corrected
type: added
area: core
visibility: public
cards: [T-0071]
created: 2026-08-02
updated: 2026-08-02
---

`workfile changelog release VERSION --amend` corrects the newest release —
`title`, `date`, `commit`, `body`, `tags`. Not `version`, which is the record's
identity and its directory name, and not `fragments`, which is what the cut
decided. Once a later release exists the earlier one is settled and the
amendment is refused, naming the release that came after it.

Until now a release was writable exactly once, at `changelog release`, and
never again: `changelog patch` reaches unreleased fragments only. Cutting a
version dated a day ahead of UTC produced a record `doctor` flagged and no
command could fix, and the recovery was `git checkout` over the cut — which
works only while it is uncommitted and only for an operator holding the
repository.

The error that sent people there is fixed too. `changelog patch REL-0010` said
the record did not exist; it now answers `CHANGE_RECORD_NOT_A_FRAGMENT` and
resolves a bare version as well. A fragment already cut into a version answers
`CHANGE_FRAGMENT_RELEASED` and names the version that froze it, instead of
reading as data loss.
