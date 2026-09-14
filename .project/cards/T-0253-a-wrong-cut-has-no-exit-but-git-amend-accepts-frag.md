---
id: T-0253
title: "A wrong cut has no exit but git: --amend accepts --fragments and drops it"
status: done
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
scope: [packages/workfile/bin/workfile.ts, packages/workfile/src/modules/changelog, packages/workfile/src/modules/mcp, packages/workfile/test, packages/workfile/docs]
verified:
  at: "2026-09-14T20:39:13.060Z"
  method: manual
  commit: fca9c8e415bdd59aaa7ce57c244fdcd4242f9327
  digest: "sha256:ccfe3d201ee8b91b0394597f4a5b1f56d9aeb6d5c5ff7dd1164c43025a0207db"
---

A consuming agent cut a release with a duplicate fragment in it (two fragments for one change). `changelog patch` on the release refuses by design, `changelog release --amend` does not touch `fragments`, and the only recovery was undoing the cut with git and cutting again — which works for an operator holding the repository and not for an agent, the exact situation `amendRelease` was written to end for `date` and `title`.

Two facts, one measured today. `RELEASE_AMENDABLE` leaves `fragments` out on purpose: «which changes went into a release is what the cut decided, and rewriting it detaches the record from the files it consumed». That reasoning holds for *adding* an id by hand. It does not hold for moving a fragment back to `unreleased/` together with its file, which keeps record and files attached and is the correction the case needs. And the CLI is inconsistent about it: `--fragments` is declared for `changelog release` in the flag table and read on the cut path, but the `--amend` branch ignores it silently — the flag-table test only asks that a declared flag is read somewhere in the handler.

What has to be decided, by the owner: (a) `changelog release VERSION --amend --drop CHG-…`, which moves the fragment's file back to `unreleased/`, removes the id from the release and re-renders — only on the newest release, like every amendment; or (b) keep the design and make `--amend --fragments` refuse with a message that names git as the exit. Either way `--amend` must not accept a flag it drops.

## Acceptance criteria

- [x] `changelog release VERSION --amend --fragments …` is refused with a message naming what `--amend` can change, instead of being accepted and ignored
- [x] The owner's decision on dropping a fragment from the newest release is recorded on this card
- [x] `changelog release VERSION --amend --drop CHG-…` moves the fragment's file back to `unreleased/` and removes its id from the newest release
- [x] After a drop, the rendered changelog no longer lists the fragment under that release, and a rendered changelog file that exists is rewritten
- [x] `changelog release VERSION --drop CHG-…` without `--amend` is refused instead of being ignored on the cut path
- [x] `amendRelease(workspace, version, { drop })` drops for a library caller the same way, and refuses an id the release did not consume and a drop that would leave it with no fragments

Criterion 2 was written as «The owner's decision on dropping a fragment from the newest release is recorded on this card, and if it is (a) the command moves the file back to `unreleased/` and the rendered changelog no longer lists it». A criterion with a branch cannot be marked whole: the decision was (a), so the branch it selects is now criteria 3 to 6, one claim each, with the library side stated because `amendRelease` is exported.

## Notes

- 2026-09-14 18:48Z illodev@local#a112f2f3 via:undeclared/xhigh — Decided by the owner on 2026-09-14: option (a). `changelog release VERSION --amend --drop CHG-…` moves the fragment's file back to `unreleased/`, removes the id from the release record and re-renders — on the newest release only, like every amendment. `--amend` must still refuse any flag it does not act on, `--fragments` included.
- 2026-09-14 19:23Z illodev@local#a112f2f3 via:undeclared/xhigh — Claimed on 2026-09-14 and paused before any code changed: the 0.13.1 release took the session. Nothing is half-done; the owner's decision (option a) is recorded above, so the card is startable as it stands.
- 2026-09-14 19:37Z illodev@local#a112f2f3 via:undeclared/xhigh — Built as decided and verified locally on 2026-09-14. amendRelease takes drop: it validates before touching anything (an id the release did not consume → RELEASE_FRAGMENT_NOT_IN_RELEASE naming what it did consume; a drop that would empty the release → RELEASE_FRAGMENTS_REQUIRED; a target already in unreleased/ → CHANGE_FRAGMENT_EXISTS), moves each dropped fragment's file back to unreleased/, rewrites fragments in the record, and puts the moves back if the write fails. An id whose file is already gone is only taken off the list, which repairs release-missing-fragment. It answers dropped [{ id, movedTo }]. The CLI refuses --amend --fragments (RELEASE_FIELD_NOT_AMENDABLE, naming what --amend changes and --drop) and --drop without --amend (RELEASE_DROP_REQUIRES_AMEND), passes --drop through, and rewrites the rendered changelog only when that file exists. With the built CLI on the fixture: '--amend --fragments CHG-0001' exit 1; '--drop CHG-0002' exit 1; '--amend --drop CHG-0002' → 'REL-0001 amended (0.1.0) / dropped CHG-0002 → .project/changelog/unreleased/CHG-0002-the-same-change-again.md / rewrote CHANGELOG.md', the 0.1.0 section lists only 'The change', changelog verify 0 errors. Pinned by changelog.test.ts 'a fragment cut into the newest release can be dropped back to unreleased' (move, unrelease, preview, render, the gone-file repair, three refusals) and cli.test.ts 'changelog release --amend drops a fragment back to unreleased and refuses --fragments'; changelog.test.ts 8/8, the flag-table test green, strict held.
- 2026-09-14 19:39Z illodev@local#a112f2f3 via:undeclared/xhigh — Tightened after review, same run: the file --drop moves must live in this release's own fragments/ directory, so an id consumed by two releases (already a doctor error) cannot move the other release's file. Rebuilt and re-run: pnpm test 534/534 (exit 0), strict held. Exit: review — all six criteria are met; the runtime evidence is the next published release carrying it.
- 2026-09-14 20:39Z illodev@local#a112f2f3 — manual verification: Verified against @illodev/workfile@0.13.2 as published on npm, installed from the registry into a scratch consumer on 2026-09-14. On the fixture with two fragments cut into 0.1.0 and CHANGELOG.md rendered: 'changelog release 0.1.0 --amend --fragments CHG-0001' refused with RELEASE_FIELD_NOT_AMENDABLE, naming what --amend changes and --drop, exit 1; 'changelog release 0.1.0 --amend --drop CHG-0002' answered 'REL-0001 amended (0.1.0) / dropped CHG-0002 → .project/changelog/unreleased/CHG-0002-the-same-change-again.md / rewrote CHANGELOG.md', exit 0, and the rendered 0.1.0 section lists only 'The change'.

## Activity

- 2026-09-14 19:03Z illodev@local#a112f2f3 via:undeclared/xhigh · claimed
- 2026-09-14 19:23Z illodev@local#a112f2f3 via:undeclared/xhigh · released
- 2026-09-14 19:29Z illodev@local#a112f2f3 via:undeclared/xhigh · claimed
- 2026-09-14 19:39Z illodev@local#a112f2f3 via:undeclared/xhigh · doing → review
- 2026-09-14 20:39Z illodev@local#a112f2f3 via:undeclared/xhigh · review → done
