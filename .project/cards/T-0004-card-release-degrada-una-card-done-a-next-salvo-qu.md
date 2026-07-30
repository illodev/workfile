---
id: T-0004
title: card release degrada una card done a next salvo que se pase --status
status: done
type: bug
priority: medium
area: core
created: 2026-07-30
updated: 2026-07-30
scope: [src/modules/cards, test]
---
## Activity

- 2026-07-30 14:52Z claude-fable-e341b469 · claimed
- 2026-07-30 14:52Z claude-fable-e341b469 · claimed
- 2026-07-30 15:00Z claude-fable-e341b469 · doing → done
- 2026-07-30 15:00Z claude-fable-e341b469 · released

## Notes

- 2026-07-30 15:23Z claude-fable-e341b469 — Fix en releaseCard: sin status explicito conserva el estado; solo doing vuelve a next. CLI y MCP delegan el default al core. Test en claims.test.mjs; evidencia viva: T-0003/T-0004 cerradas con release y siguieron en done.
