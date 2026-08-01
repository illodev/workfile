---
id: T-0086
title: card patch bypasses the done gate and writes no activity trail
status: done
type: bug
priority: high
area: core
created: 2026-08-01
updated: 2026-08-01
scope: [packages/workfile/src/modules/cards/mutations.ts, packages/workfile/src/server/http.ts, packages/workfile/src/modules/mcp/tools.ts, packages/workfile/bin/workfile.ts]
---
T-0084 put the acceptance gate inside `transitionCard`. That is one of four ways
to set a status, and it is the one a human uses. The three an agent uses go
through `patchCard`, which set `status` as an ordinary field.

Reproduced on this checkout, on a card with one unchecked criterion:

| door | before |
|---|---|
| `card transition T-x done` | refused, `CARD_ACCEPTANCE_UNMET` |
| `card patch T-x --json-input '{"status":"done"}'` | accepted |
| `PATCH /api/v2/cards/T-x` | 200 |
| `PATCH /api/tasks/T-x` (legacy) | 200 |
| `project_card_patch` | accepted |
| `card release T-x --status done` | accepted |

The same omission dropped the Activity line. `trailEnabled` was consulted in
`claimCard`, `releaseCard` and `transitionCard` and nowhere else, so a patch
could leave a file reading `status: done` whose last trail entry said
"claimed" — the durable record of who closed the card, missing exactly on the
paths that close most of them.

## The fix

One gate, not four. `assertAcceptanceMet` is a function every path to `done`
calls: `transitionCard`, `releaseCard` when it moves the card there, and
`patchCard` when the patch changes the status. A status change through `patch`
is the same protocol event it is through `transition`, so it also appends the
same trail line, and a patch that does not touch the status appends nothing.

`--force` gets through everywhere, as documented.

The actor had to be threaded to reach the trail, which surfaced the HTTP half of
T-0079: `POST /api/v2/cards/:id/transition` passed `actor: body.actor`, and the
ownership guard reads `claimed_by && actor && ...`, so omitting the field was a
way past it. It now falls back to `resolveActor()` the way the CLI does.

Not done here: `patchCard` still accepts `claimed_by` as a plain field, so the
claim can be forged by writing it directly. That is a separate hole and a
separate card.

## Acceptance criteria

- [x] `card patch` refuses `status: done` while a criterion is unchecked
- [x] Both HTTP PATCH routes refuse it, with `CARD_ACCEPTANCE_UNMET`
- [x] `project_card_patch` refuses it
- [x] `card release --status done` refuses it, and an already-done card stays releasable
- [x] A status change through patch appends the trail line, with the resolved actor
- [x] A patch that does not change the status appends nothing
- [x] `--force` still gets through on every door
- [x] The tests fail on the code as it was before the fix

## Activity

- 2026-08-01 19:06Z illodev@local#e55eab30 · doing → review
- 2026-08-01 19:12Z illodev@local#e55eab30 · review → done

