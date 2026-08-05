---
id: CHG-0116
title: The board names who moved a card, and claiming from it no longer locks you out
type: fixed
area: ui
visibility: public
created: 2026-08-05
updated: 2026-08-05
---
Every mutation the interface makes goes through the legacy `/api/tasks` routes,
and those resolved an actor for exactly one status. A drag from `backlog` to
`next` reached `patchCard` with no actor at all, and the trail recorded it as
`unknown`:

```
- 2026-08-05 10:28Z unknown · backlog → next                  ← the board
- 2026-08-05 10:28Z illodev@local#9c7e31aa · next → backlog   ← the CLI
```

Both lines are the same person, on the same card, a second apart.

The claim path was worse. Moving a card to `doing` from the board wrote the
literal `"ui-local"` into `claimed_by`, and nothing resolves to that — so the
board locked its own author out of the card it had just given them:

```
$ workfile card release T-0003
CARD_CLAIM_OWNER_MISMATCH: T-0003 is claimed by ui-local.
```

The edit guard reads `claimed_by` against the identity it derives, so it also
asked about every write to a card claimed this way. This is the failure T-0079
fixed for a hand-typed `--actor`, reached through the interface instead.

The identity was never missing: `resolveActor()` had the answer, `agents
whoami` printed it, and several v2 routes already called it. What was missing
was the argument, at three call sites. It is resolved once now, in the function
all of them go through, and `actor` in the request body still wins over it.

One behaviour changed beyond attribution: a move that arrives for a card
someone else holds is no longer attributed to the holder and waved through. It
fails the way the CLI fails.
