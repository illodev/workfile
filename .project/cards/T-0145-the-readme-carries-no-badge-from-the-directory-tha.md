---
id: T-0145
title: The README carries no badge from the directory that now builds the server
status: done
type: task
priority: low
area: docs
tags: [readme, glama, registry]
created: 2026-08-03
updated: 2026-08-03
scope: [README.md]
---

Glama now has a published release for `illodev/workfile`: the build spec
installs the workspace, compiles the core and starts the stdio server, and the
score page reports `Has a Glama release`. The README does not mention any of
it.

Glama publishes two badges for a listed server, and both resolve today:

- `badges/score.svg` — the small `A · A` chip, 3.9 KB
- `badges/card.svg` — the larger card with the license, quality and maintenance
  circles, 22.6 KB

Both were checked with `curl`: HTTP 200, `image/svg+xml`.

## Why bother

[[T-0141]] argued the point already, against the letter grade: discovery is
what being listed buys, not the score. A badge is the other half of that
trade — it is the only path from the repository back to the directory entry,
and the README is where someone arriving from npm or GitHub actually looks.

## Acceptance criteria

- [x] The score badge sits in the header block, under the tagline
- [x] The card badge closes the `## Model Context Protocol` section, where the
      server it describes is documented
- [x] Both badge images resolve and both link to the Glama server page
- [x] A changelog fragment records the change
- [x] The badges render on github.com, which needs the commit pushed

## Activity

- 2026-08-03 20:23Z illodev@local#07eb5d4b · claimed
- 2026-08-03 20:24Z illodev@local#07eb5d4b · doing → review
- 2026-08-03 21:00Z illodev@local#07eb5d4b · review → done

