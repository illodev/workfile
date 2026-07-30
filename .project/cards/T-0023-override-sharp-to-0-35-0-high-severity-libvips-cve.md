---
id: T-0023
title: "Override sharp to 0.35.0: high-severity libvips CVEs via transformers.js"
status: done
type: bug
priority: high
area: infra
created: 2026-07-30
updated: 2026-07-30
scope: [package.json, pnpm-lock.yaml]
---
## Activity

- 2026-07-30 20:02Z claude-fable-e341b469 · claimed
- 2026-07-30 20:03Z claude-fable-e341b469 · doing → done
- 2026-07-30 20:03Z claude-fable-e341b469 · released

## Notes

- 2026-07-30 20:03Z claude-fable-e341b469 — pnpm override sharp ^0.35.0 in root package.json (upstream transformers 4.2.0 still pins ^0.34.5). Evidence: pnpm audit --audit-level=high reports no known vulnerabilities; 161/161 tests; real embeddings run verified post-override. Dependabot alert #1 should auto-close on rescan.
