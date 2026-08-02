---
id: T-0137
title: A release publishes to npm and the registry but never to GitHub Releases
status: next
type: task
priority: medium
area: infra
created: 2026-08-02
updated: 2026-08-02
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
- [ ] Its body comes from the changelog fragments, not from a hand-written copy
      that can drift
- [ ] The step runs after npm and the MCP Registry, and failing it does not
      unpublish either
- [ ] The releases already shipped are backfilled, or a note records the
      decision not to
