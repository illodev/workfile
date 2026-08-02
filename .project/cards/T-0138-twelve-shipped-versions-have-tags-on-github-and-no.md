---
id: T-0138
title: Twelve shipped versions have tags on GitHub and no release notes
status: backlog
type: task
priority: low
area: infra
created: 2026-08-02
updated: 2026-08-02
---

[[T-0137]] makes every future tag publish its notes. It deliberately does not
touch the twelve already shipped, because backfilling is a different act: it
publishes twelve releases at once and GitHub notifies watchers on each.

Everything needed is in place and proven. `CHANGELOG.md` has a section for
every one of them, `scripts/release-notes.ts` extracts any version, and the
`gh release create` call was exercised against v0.4.0 as a draft.

```sh
for tag in $(git tag --sort=creatordate); do
    node ./scripts/release-notes.ts "${tag#v}" > /tmp/notes.md &&
        gh release create "$tag" --title "$tag" --notes-file /tmp/notes.md
done
```

Two things to settle before running it, neither of which has an obvious
answer:

- **The notification.** Twelve at once reads as noise to anyone watching
  releases. `--notes-file` has no quiet mode; the only lever is doing it while
  the watcher count is small, which argues for sooner rather than later.
- **Whether old notes help anyone.** The value is that someone landing on the
  tag list sees what each version was. The cost is a wall of retroactive
  releases dated today, since GitHub stamps the creation time rather than the
  tag's.

Dropping this is a legitimate outcome. Close it as discarded with the reason
rather than leaving it open forever.

## Acceptance criteria

- [ ] Either every existing tag has a release whose body came from
      `CHANGELOG.md`, or the card is closed with the reason not to
