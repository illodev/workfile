---
id: T-0260
title: npm and the MCP Registry link the README and the demo, not the site
status: review
type: chore
priority: medium
area: infra
source: .project/cards/T-0259-the-site-addresses-the-agent-reading-it-and-gives-.md
scope: [packages/workfile/package.json, server.json]
raised: derived
produced_by:
  model: undeclared
  reasoning: xhigh
  basis: self-reported
created: 2026-09-14
updated: 2026-09-14
---

Found while auditing the site's search presence for [[T-0259]]: the only field that points at `https://workfile.illodev.com` is the GitHub repository's homepage. `packages/workfile/package.json` sets `homepage` to the package README on GitHub, which is what npmjs.com shows as the homepage, and `server.json` sets `websiteUrl` to the demo, which is what the MCP Registry and the directories mirroring it show. Every listing that ranks above the site in web search sends its readers somewhere else.

These fields reach users with a release, not with a deploy of `site/`, which is why this is its own card.

## Acceptance criteria

- [x] `homepage` in `packages/workfile/package.json` is `https://workfile.illodev.com`
- [x] `websiteUrl` in `server.json` is `https://workfile.illodev.com`
- [ ] The npm page of the next published version shows the site as its homepage
- [ ] The MCP Registry entry of the next published version shows the site as its website

## Activity

- 2026-09-14 21:35Z illodev@local#b67ed9cd via:undeclared/xhigh · claimed
- 2026-09-14 21:50Z illodev@local#b67ed9cd via:undeclared/xhigh · doing → review

## Notes

- 2026-09-14 21:37Z illodev@local#b67ed9cd via:undeclared/xhigh — homepage in packages/workfile/package.json and websiteUrl in server.json now point at https://workfile.illodev.com; pnpm run check exits 0 with the change. Criteria 3 and 4 are the npm page and the MCP Registry entry of the next published version, which only a release shows. Not yet committed.
- 2026-09-14 21:50Z illodev@local#b67ed9cd via:undeclared/xhigh — Merged to main in 11bfd43 through PR #46, CI green on every runner. Criteria 3 and 4 are the npm page and the MCP Registry entry of the next published version; until a release is cut they keep showing the old links, so this waits in review for that release.
