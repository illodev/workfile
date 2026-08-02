---
id: T-0107
title: The npm next dist-tag still points at 0.1.0-rc.1
status: backlog
type: task
priority: low
area: infra
created: 2026-08-02
updated: 2026-08-02
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

- [ ] `next` is removed, or points at something newer than `latest`
- [ ] If kept, the release workflow maintains it rather than a human
