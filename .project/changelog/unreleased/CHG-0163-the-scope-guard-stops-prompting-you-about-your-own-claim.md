---
id: CHG-0163
title: The scope guard stops prompting you about your own claim
type: fixed
area: core
visibility: public
created: 2026-09-03
updated: 2026-09-03
---

`claimSeparation` read a missing session as "that side has no session" and returned `sessions-differ`. But a missing session means the workspace could not *find* one — a `claimed_by` written from an explicit `--actor` carries no tail and matches no session file — while the scope guard's own side always carries one, off the hook payload. So for a declared actor the test fired on every call, the actor comparison below it was unreachable, and the guard asked agents about the cards they had claimed themselves.

The actor comparison now runs before the one-sided test: the same actor with at most one session seen is `unproven`, which is the verdict the rule already declared and the one the guard does not prompt on. Every other label is unchanged. Declaring the identity you claim with (`WORKFILE_ACTOR`) is now what buys the silence.
