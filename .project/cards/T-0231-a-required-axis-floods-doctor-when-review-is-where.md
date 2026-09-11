---
id: T-0231
title: A required axis floods doctor when review is where work rests
status: review
type: task
priority: medium
area: core
raised: reported
created: 2026-09-02
updated: 2026-09-11
scope: [packages/workfile/src, packages/workfile/test, packages/workfile/docs]
---

`missing-axis` warns on every open card that does not carry a declared axis. The rule is written
with care and its own comment says why — it warns *only on work still in play*, because "doctor
output that nobody can act on is output nobody reads."

**That reasoning is right and the rule still floods, because `closed()` does not match every
project's lifecycle.** Upstream, open means `!(done | discarded | archived)`. In fube-v2 the
protocol reserves `done` for work with runtime evidence, which an agent can almost never provide,
so **`review` is where work rests** — not where it is in play. The result, measured 2026-09-02:

```
1487 missing-axis   of 2018 total warnings   (74 %)
```

One axis, one project, three quarters of the gate the protocol tells every session to pass before
finishing. Underneath it there was real signal nobody could see: 159 `done-unchecked`, 27
`acceptance-unreadable`, 64 `filename-stale`.

And it grows on its own: every card that reaches `review` keeps warning forever, so the number goes
up with each working day even when nobody writes a bad card.

## What the project could do about it today: nothing

`cards.axes` maps a name to an array of allowed values, and the code reads that array as `allowed`.
There is no shape for "declare the vocabulary but do not require it", and no way to say which
statuses this project considers closed. So the only lever from `project.config.mjs` is to **stop
declaring the axis**, which is what fube-v2 just did — losing `card list --axis goal=…` for the 37
cards that still use it.

That is a bad trade to have to make: the vocabulary is useful, the filter is useful, and the only
way to stop the noise is to throw both away.

## Two shapes that would fix it

Either would do; the first is smaller.

1. **An optional axis.** Let the value be an object instead of an array:

   ```js
   axes: { goal: { values: [...], required: false } }
   ```

   `invalid-axis` keeps firing on a typo — which is the half that catches real mistakes — and
   `missing-axis` stops firing. An array keeps meaning "required", so nothing breaks.

2. **A project-declared closed set.** `cards.closedStatuses: ["done", "discarded", "review"]`, used
   by `closed()`. This one reaches further than the axis — every "only on open work" rule inherits
   it — and it is the more honest fix for a project whose terminal state is not `done`.

## Decided on 2026-09-11: the optional axis, and why not the closed set

Shape 1 shipped. `cards.axes.NAME` takes `{ values: [...], required: false }` beside the array,
and the array keeps meaning required. One reader, `axisDeclarations()`, normalises both shapes for
everything downstream; `missing-axis` skips an optional axis; `invalid-axis` and the write-path
refusal do not; `schema --json` lists `cards.optionalAxes` beside `cards.axes`, whose shape is
unchanged so the UI and every other reader of name → values keep working.

Shape 2 was measured before being left, on a scratch copy of the same board (2 550 cards) with
`goal` re-declared as a required array: **1 485 `missing-axis` of 2 072 warnings, 71 %** — the
2026-09-02 number reproduced. By status: 1 127 `backlog`, 261 `review`, 33 `next`, 32 `blocked`,
31 `deferred`, 1 `doing`. A project-declared closed set that counted `review` as closed would have
removed 261 and left 1 224. The flood was never mostly `review`: it was a vocabulary declared for a
handful of sweeps on a board where most open cards belong to no sweep, and that is exactly what
`required: false` says and a closed set cannot. The same copy with the axis declared optional:
**0 `missing-axis`, the same 4 `invalid-axis`** (values outside the vocabulary the copy declared),
and `card list --axis goal=…` filtering as before.

## Acceptance criteria

- [x] An axis can be declared `{ values, required: false }`: `missing-axis` then stays silent for it
      while an axis declared as an array is unchanged
- [x] `invalid-axis` still fires on a value outside the vocabulary
- [x] A project that declares an axis and requires it sees no change

## Activity

- 2026-09-11 16:39Z illodev@local#597ecdc9 · claimed
- 2026-09-11 16:47Z illodev@local#597ecdc9 · released

## Notes

- 2026-09-11 16:47Z illodev@local#597ecdc9 — Pinned by axes.test.ts: the config test accepts { values, required } and refuses an unknown key, a non-boolean required, an empty or missing values list and a bare string, each by its own code; 'an optional axis keeps its vocabulary and its error, and loses the warning' declares goal optional beside a required context and asserts invalid-axis on a typo, no missing-axis for goal, the same three missing-axis lines for context that a required axis emitted before, the write-path refusal and card list --axis goal=leaks. The existing doctor test for a required axis passes unchanged, which is criterion 3. Measured on a scratch copy of the Fube board with the shipped build: required → 1 485 missing-axis, optional → 0, invalid-axis 4 either way; the by-status split (1 127 backlog vs 261 review) is why the closed-set shape was not taken — it would have left 1 224 of the 1 485.
