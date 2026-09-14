---
id: T-0253
title: "A wrong cut has no exit but git: --amend accepts --fragments and drops it"
status: next
type: task
priority: medium
area: core
source: .project/docs/research/DOC-0007-field-report-a-consuming-agent-on-0-13-0-relayed-2026-09-12.md
related: [DOC-0007]
raised: derived
produced_by:
  model: undeclared
  reasoning: xhigh
  basis: self-reported
created: 2026-09-12
updated: 2026-09-14
scope: [packages/workfile/bin/workfile.ts, packages/workfile/src/modules/changelog, packages/workfile/test, packages/workfile/docs/cli.md]
---

A consuming agent cut a release with a duplicate fragment in it (two fragments for one change). `changelog patch` on the release refuses by design, `changelog release --amend` does not touch `fragments`, and the only recovery was undoing the cut with git and cutting again — which works for an operator holding the repository and not for an agent, the exact situation `amendRelease` was written to end for `date` and `title`.

Two facts, one measured today. `RELEASE_AMENDABLE` leaves `fragments` out on purpose: «which changes went into a release is what the cut decided, and rewriting it detaches the record from the files it consumed». That reasoning holds for *adding* an id by hand. It does not hold for moving a fragment back to `unreleased/` together with its file, which keeps record and files attached and is the correction the case needs. And the CLI is inconsistent about it: `--fragments` is declared for `changelog release` in the flag table and read on the cut path, but the `--amend` branch ignores it silently — the flag-table test only asks that a declared flag is read somewhere in the handler.

What has to be decided, by the owner: (a) `changelog release VERSION --amend --drop CHG-…`, which moves the fragment's file back to `unreleased/`, removes the id from the release and re-renders — only on the newest release, like every amendment; or (b) keep the design and make `--amend --fragments` refuse with a message that names git as the exit. Either way `--amend` must not accept a flag it drops.

## Acceptance criteria

- [ ] `changelog release VERSION --amend --fragments …` is refused with a message naming what `--amend` can change, instead of being accepted and ignored
- [ ] The owner's decision on dropping a fragment from the newest release is recorded on this card, and if it is (a) the command moves the file back to `unreleased/` and the rendered changelog no longer lists it

## Notes

- 2026-09-14 18:48Z illodev@local#a112f2f3 via:undeclared/xhigh — Decided by the owner on 2026-09-14: option (a). `changelog release VERSION --amend --drop CHG-…` moves the fragment's file back to `unreleased/`, removes the id from the release record and re-renders — on the newest release only, like every amendment. `--amend` must still refuse any flag it does not act on, `--fragments` included.
- 2026-09-14 19:23Z illodev@local#a112f2f3 via:undeclared/xhigh — Claimed on 2026-09-14 and paused before any code changed: the 0.13.1 release took the session. Nothing is half-done; the owner's decision (option a) is recorded above, so the card is startable as it stands.

## Activity

- 2026-09-14 19:03Z illodev@local#a112f2f3 via:undeclared/xhigh · claimed
- 2026-09-14 19:23Z illodev@local#a112f2f3 via:undeclared/xhigh · released
