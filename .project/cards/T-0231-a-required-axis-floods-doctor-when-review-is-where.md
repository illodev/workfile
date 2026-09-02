---
id: T-0231
title: A required axis floods doctor when review is where work rests
status: backlog
type: task
priority: medium
area: core
raised: reported
created: 2026-09-02
updated: 2026-09-02
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

## Acceptance criteria

- [ ] An axis can be declared without being required, or the project can declare which statuses
      count as closed
- [ ] `invalid-axis` still fires on a value outside the vocabulary
- [ ] A project that declares an axis and requires it sees no change
