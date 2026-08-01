---
id: T-0075
title: The README says what Workfile is not, and what it composes with
status: done
type: task
priority: medium
area: docs
created: 2026-08-01
updated: 2026-08-01
scope: [README.md, packages/workfile/README.md]
---
Someone asked why they should reach for Workfile rather than an agent-ecosystem
configurator. The honest answer is that the question compares two different
layers — but nothing in the README said so, so the reader had no way to know.

`## Boundaries` in the repository README now states it: what a configurator does,
what Workfile does, that they compose, and the four things Workfile guarantees
that no agent configuration can. It closes with the negative half — no agent
installation, no persona, no model routing, no skill catalogue — because a
boundary that only lists strengths is marketing, not a boundary.

The package README carries a short form, since npm renders that one and it is
where most first readers land. It links back to the full section.

Rationale and the constraints this puts on future work are in ADR-0006.

## Evidence

- `pnpm workfile doctor` — 0 errors, 0 warnings.
- Rendered on github.com at f50aab8: the `Boundaries` heading, its four
  guarantees and the named link all appear, and the `#boundaries` anchor the
  package README points at resolves.

## Activity

- 2026-08-01 11:52Z agent:claude · doing → review
- 2026-08-01 11:52Z agent:claude · released
- 2026-08-01 11:52Z agent:claude · review → done

