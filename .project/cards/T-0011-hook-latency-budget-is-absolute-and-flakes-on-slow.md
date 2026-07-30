---
id: T-0011
title: Hook latency budget is absolute and flakes on slow runners
status: done
type: bug
priority: medium
area: mcp
created: 2026-07-30
updated: 2026-07-30
scope: [test/claude-surface.test.mjs]
---
## Activity

- 2026-07-30 16:30Z claude-fable-e341b469 · claimed
- 2026-07-30 16:31Z claude-fable-e341b469 · doing → done
- 2026-07-30 16:31Z claude-fable-e341b469 · released
- 2026-07-30 16:35Z claude-fable-e341b469 · claimed
- 2026-07-30 16:35Z claude-fable-e341b469 · doing → done
- 2026-07-30 16:35Z claude-fable-e341b469 · released

## Notes

- 2026-07-30 16:31Z claude-fable-e341b469 — Budget reformulated as relative: p95 of the guarded hook must stay under 3x the p95 of an empty node spawn measured in the same loop, plus 200ms for the board read. Importing the package graph still blows the multiple on any machine. 3/3 local.
- 2026-07-30 16:35Z claude-fable-e341b469 — Second pass: the floor is now a stand-in process paying the same fixed costs (spawn, script read, stdin round-trip, two file reads) with medians instead of max-of-20, budget 2x floor + 150ms. The first relative budget still tripped at 631ms vs 584ms because an empty node -e paid neither stdin nor script I/O, and package-manager detection added lockfile stats to the hook.
