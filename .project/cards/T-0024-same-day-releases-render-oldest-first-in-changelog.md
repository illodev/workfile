---
id: T-0024
title: "Same-day releases render oldest-first in CHANGELOG: tie-break by id ascending"
status: done
type: bug
priority: high
area: core
created: 2026-07-30
updated: 2026-07-30
scope: [src/modules/changelog, test/changelog.test.mjs]
---
## Activity

- 2026-07-30 20:07Z claude-fable-e341b469 · claimed
- 2026-07-30 20:09Z claude-fable-e341b469 · doing → done
- 2026-07-30 20:09Z claude-fable-e341b469 · released

## Notes

- 2026-07-30 20:09Z claude-fable-e341b469 — Tie-break flipped to id descending in loadChangelog release sort: two releases cut the same day rendered oldest-first (0.1.1 above 0.1.2 in the published CHANGELOG). Found live while cutting REL-0002. Evidence: new same-day ordering test in changelog.test.mjs; CHANGELOG re-rendered with 0.1.2 first; 162/162 tests; strict held.
