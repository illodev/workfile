---
id: T-0137
title: A release publishes to npm and the registry but never to GitHub Releases
status: review
type: task
priority: medium
area: infra
created: 2026-08-02
updated: 2026-08-02
scope: [.github/workflows/release.yml, scripts, .project/cards, .project/changelog]
---

`gh release list --repo illodev/workfile` returns nothing. Twelve versions
have shipped and the repository has tags for them and nothing else: the
Release workflow verifies the tag, publishes to npm, publishes `server.json`
to the MCP Registry, and stops.

So the one place a reader looks first for what changed is empty, while this
repository keeps a fuller changelog than most — `REL-0012` lists the 25
fragments that made 0.4.0, each one written when the change landed and each
naming its card. All of it is invisible outside the repository.

Glama noticed before anyone else did. Its Maintenance criterion grades B with
"195 commits in last 12 weeks; CI passing; but lacks stable releases", which
is the only mechanical signal reading tags-without-releases as an abandoned
project. That is a symptom rather than the reason to fix it — people watch
releases, and a watcher gets nothing today.

## The fix

A step after the registry publish, gated on the same tag. The body already
exists: `workfile changelog preview` renders the fragments, and
`.project/changelog/releases/<version>/REL-*.md` is the released set for the
version the tag names.

Ordering matters the way it did for the registry step, and in the opposite
direction. npm and the MCP Registry are irreversible and must come first, so a
failure here leaves the packages published and the release note missing —
recoverable by hand, unlike the reverse.

Worth deciding at the same time: whether the note is generated from the
fragments alone, or whether a release gets a written opening paragraph. The
fragments are accurate and flat; twelve versions of flat lists is what makes
people stop reading release notes.

## Acceptance criteria

- [ ] A `v*` tag creates a GitHub Release for that version
- [x] Its body comes from the changelog fragments, not from a hand-written copy
      that can drift
- [x] The step runs after npm and the MCP Registry, and failing it does not
      unpublish either
- [x] The releases already shipped are backfilled, or a note records the
      decision not to

## Activity

- 2026-08-02 21:55Z illodev@local#bd44efc7 · claimed
- 2026-08-02 22:06Z illodev@local#bd44efc7 · doing → review

## Notes

- 2026-08-02 22:04Z illodev@local#bd44efc7 — The note is the version's section of `CHANGELOG.md`, which `changelog release` already renders from the fragments, so there is no second copy to keep in step.

Evidence:

    node ./scripts/release-notes.ts 0.4.0   --> the 0.4.0 section, 1568 bytes
                                    0.1.1   --> the last section, which has no
                                                following heading to stop at
                                    9.9.9   --> exit 1, naming the command to run
    gh release create --draft               --> created, isDraft true, body matches
    gh release delete                       --> gone; tag v0.4.0 still on the remote
    PyYAML parse of release.yml             --> 2 jobs; release has contents: write
                                                and needs: publish; publish keeps
                                                the workflow-level permissions
    pnpm run check                          --> 250 + 7 pass, strict 590, none new

`gh release create` was exercised as a draft rather than a real release: a draft is not public, notifies nobody, and deletes without trace. The tag was checked afterwards to be sure the delete had not taken it.

One latent bug closed while writing it. Matching the heading with `startsWith` would have found `0.1.1` inside `## 0.1.10` and published the wrong notes on the first version to go two digits. The first token is now compared whole, proven by inserting a synthetic `0.1.10` section and watching each version resolve to its own.

Left in review, not done. The script and the API call are proven; the workflow step has never executed, so what a real tag has yet to show is that `contents: write` on that job suffices in CI and that `needs: publish` sequences as intended. The next release is the verification, the same way [[T-0114]] was left.

The backfill is [[T-0138]], deliberately not done here: it publishes twelve releases at once and notifies watchers on each.
