---
id: T-0107
title: The npm next dist-tag still points at 0.1.0-rc.1
status: done
type: task
priority: low
area: infra
created: 2026-08-02
updated: 2026-08-02
scope: [.github/workflows/release.yml]
---

Read off the registry right after publishing 0.3.0:

```
dist-tags = { next: '0.1.0-rc.1', latest: '0.3.0' }
```

`npm install @illodev/workfile@next` therefore installs a release candidate
from before the first stable version — behind `latest` by every release the
project has ever cut. Anyone reaching for `@next` expecting the leading edge
gets the opposite, and silently.

The tag was presumably set once during the 0.1.0 bootstrap and never revisited.
The release workflow publishes to `latest` and does not touch it, so nothing
will ever move it.

## The fix

Decide whether the channel is wanted at all. If it is not, `npm dist-tag rm
@illodev/workfile next`. If it is, it needs something that maintains it — a
prerelease path in the release workflow keyed on the tag shape (`v*-rc.*`
publishes to `next`), because a dist-tag nobody updates is worse than no
channel.

Needs the maintainer's npm credentials either way.

## Acceptance criteria

- [x] `next` is removed, or points at something newer than `latest`
- [x] If kept, the release workflow maintains it rather than a human

## Activity

- 2026-08-02 16:41Z illodev@local#aed59c5e · claimed
- 2026-08-02 16:49Z illodev@local#aed59c5e · doing → review
- 2026-08-02 16:49Z illodev@local#aed59c5e · released
- 2026-08-02 16:56Z illodev@local#aed59c5e · claimed
- 2026-08-02 16:56Z illodev@local#aed59c5e · doing → done
- 2026-08-02 16:56Z illodev@local#aed59c5e · released

## Notes

- 2026-08-02 16:45Z illodev@local#aed59c5e — Two corrections to this card, both from reading the workflow and the registry.

The premise is wrong. `release.yml:45-48` already routes prereleases to `next`:

```sh
case "$VERSION" in
    *-*) DIST_TAG=next ;;
    *) DIST_TAG=latest ;;
esac
```

That has been there since the first commit, `c034193`. So the second
acceptance criterion — the release workflow maintains it rather than a human —
is already met for the case it covers. The tag is not unmaintained; it is a
relic of the single `0.1.0-rc.1` bootstrap publish, which is the only
prerelease this project has ever shipped. `@illodev/workfile-search-local`,
which did not exist then, has no `next` tag at all — which confirms the origin.

What the workflow does not do is stop `next` falling behind. It only ever sets
the tag when publishing a prerelease; nothing advances it when a stable
release overtakes it. So `v0.4.0-rc.1` then `v0.4.0` leaves `next` pointing at
the release candidate, and the drift this card describes returns.

The obvious fix — an `npm dist-tag add` step after publishing — cannot work
here. This workflow authenticates by OIDC trusted publishing and deliberately
stores no npm token (`release.yml:19-21`: any configured token makes the CLI
skip the OIDC exchange). npm's documentation is explicit that "OIDC
authentication supports the `npm publish` and `npm stage publish` commands"
and that other commands "still require traditional authentication methods".
`npm dist-tag add` is not covered, `npm publish` takes only one `--tag`, and
the request to allow it is open upstream as npm/cli#8547 (filed 2025-09-03,
still open). Recorded as [[LRN-0010]].

So keeping `next` current from CI requires putting a long-lived npm token back
into a workflow that was built to have none. That is a security trade-off the
maintainer has to make, not a detail of the implementation — blocked pending
that decision, and on the credentials this card already says it needs.
- 2026-08-02 16:48Z illodev@local#aed59c5e — Decision: the channel goes. Recorded because the card left it open.

`release.yml` no longer routes anything to `next`. The branch that did is now
a refusal — a `v*-rc.*` tag fails the release instead of publishing — because
simply deleting it would have let a release candidate publish to `latest`,
which is worse than the tag this replaces. README's Releasing section says so
too, and says why: it is a consequence of trusted publishing, not a taste.

Verified: 227 + 7 tests pass, the workflow still parses as YAML at 8 steps,
and the guard was exercised against 0.3.0, 0.4.0, 1.0.0 (publish to latest)
and 0.4.0-rc.1, 0.4.0-beta.2, 1.0.0-alpha (refused).

The second acceptance criterion is met by the channel not being kept. The
first needs one command from the maintainer's terminal, since no credential in
CI can make this registry write:

    npm dist-tag rm @illodev/workfile next

`@illodev/workfile-search-local` needs nothing — it has no `next` tag, having
been first published after the bootstrap.

Left in review rather than done: `npm view @illodev/workfile dist-tags` still
answers `{ next: '0.1.0-rc.1', latest: '0.3.0' }`, and only the registry can
settle this one.
- 2026-08-02 16:56Z illodev@local#aed59c5e — Verified against the registry rather than against the terminal that ran it.

    npm view @illodev/workfile dist-tags        --> { "latest": "0.3.0" }
    npm view @illodev/workfile-search-local ... --> { "latest": "0.3.0" }
    npm view @illodev/workfile@next version     --> npm error 404

`next` is gone from both packages and `@next` now fails loudly instead of
serving `0.1.0-rc.1`. Run by the maintainer on 2026-08-02 with browser
authentication; the registry answered on the first poll, no replication lag.

Both acceptance criteria met, and the criterion that matters is the one the
registry answers, so this is done rather than review.
