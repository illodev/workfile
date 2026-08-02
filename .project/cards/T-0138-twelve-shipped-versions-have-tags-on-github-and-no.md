---
id: T-0138
title: Twelve shipped versions have tags on GitHub and no release notes
status: done
type: task
priority: low
area: infra
created: 2026-08-02
updated: 2026-08-02
scope: [.project/cards]
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

- [x] Either every existing tag has a release whose body came from
      `CHANGELOG.md`, or the card is closed with the reason not to

## Activity

- 2026-08-02 22:46Z illodev@local#bd44efc7 · claimed
- 2026-08-02 22:46Z illodev@local#bd44efc7 · doing → done

## Notes

- 2026-08-02 22:46Z illodev@local#bd44efc7 — Backfilled: twelve releases, v0.1.1 through v0.4.0, bodies from `CHANGELOG.md` via `scripts/release-notes.ts`. `v0.4.0` carries Latest; the rest were created with `--latest=false` so the flag did not depend on loop order.

`v0.1.0` was skipped and said so. It has no section in `CHANGELOG.md` — the rendered changelog starts at 0.1.1 — so the script exits 1 rather than publishing an empty note. The naive loop recorded on this card would have died there instead of continuing.

Both concerns this card raised turned out not to apply, and one of the two checks behind that was wrong:

- **Notifications.** The repository has 0 watchers, so there was nobody to notify. That one holds.
- **Dates.** I checked this on a draft release, read `created_at`, saw the tag's own date, and concluded the backfill would carry honest dates. A draft has `published_at: null`; publishing is what stamps it. Both fields exist and they disagree:

        v0.1.1   created_at    2026-07-30T16:49:55Z   the tag's date
                 published_at  2026-08-02T22:45:08Z   the backfill

  GitHub's releases page renders the published date, so all twelve read as released today. The API keeps the true date and so does the tag, but the page a visitor sees does not.

Left in place rather than reverted. The distortion is small on a repository four days old that genuinely shipped thirteen versions in those four days, and the notes themselves are accurate per version. Deleting a release does not touch its tag — proven twice in this session — so this stays reversible if the page reads badly once there is an audience.
