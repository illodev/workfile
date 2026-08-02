---
id: T-0108
title: A no-op transition writes a line into the durable trail
status: backlog
type: bug
priority: low
area: core
scope: [packages/workfile/src/modules/cards/mutations.ts]
created: 2026-08-02
updated: 2026-08-02
---

`card transition ID review` on a card already in `review` appends
`review → review` to `## Activity`. Reproduced on a scratch workspace: three
identical transitions, three lines.

```
- 2026-08-02 10:47Z illodev@local · backlog → review
- 2026-08-02 10:47Z illodev@local · review → review
- 2026-08-02 10:47Z illodev@local · review → review
```

The `doing` case has the same shape through a different door: `transitionCard`
delegates to `claimCard`, so re-claiming a card you already hold appends a
second `claimed`. Both were hit in one session — the claim plus a redundant
`transition doing`, which is a sequence an agent following the start-work
workflow literally to the letter will produce.

The trail is specified as five to fifteen lines over a card's whole life,
reviewable in a diff. A line that records nothing having happened is exactly
what erodes that: the reader cannot tell a real move from a repeated command.

The fix is a guard where the trail is written, not at the callers — `patchCard`,
the HTTP routes and the MCP tools all reach the same place, and a rule enforced
at one of four entrances is the failure this module has already had once.

## Acceptance criteria

- [ ] Transitioning to the status a card already has leaves the trail unchanged
- [ ] Re-claiming a card the same actor already holds leaves the trail unchanged
- [ ] A real transition still writes exactly one line
- [ ] The guard sits at the write path, so all four surfaces inherit it
