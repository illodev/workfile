---
id: T-0111
title: ADR-0001 is still accepted and describes an interface that was deleted
status: done
type: task
priority: medium
area: docs
created: 2026-08-02
updated: 2026-08-02
---

ADR-0001 — "The UI implements the bespoke design spec in `design/redesign.dc.html`" — is still `accepted`. Its body says the presentation layer is one plain stylesheet, `ui/src/styles.css`, carrying oklch tokens and component classes, with no CSS framework, enforced by `test/design-system.test.mjs`.

None of that is true any more. T-0038 executed the third shadcn migration under [[ADR-0005]] and deleted the bespoke stylesheet in the same PR — that was the whole point of the no-coexistence rule. The test file it names has since become `.ts` and asserts the opposite direction.

The supersede chain stops one record short: ADR-0004 was superseded by ADR-0005 when the migration landed, but ADR-0001 — which ADR-0004 grew out of — was never touched.

Surfaced on 2026-08-02 while deleting `design/`: the ADR names an artifact that no longer exists on disk *and* a stylesheet that no longer exists in the code, and it still reads as current policy to anyone searching decisions.

## Fix

Decide whether ADR-0001 is superseded by ADR-0005 or simply historical, and mark it. `workfile memory supersede ADR-0001 --by ADR-0005` if the former. Either way it should stop returning as accepted policy.

## Acceptance criteria

- [x] ADR-0001 no longer reads as accepted policy
- [x] Nothing in `.project/memory/decisions/` still describes the bespoke stylesheet as shipped

## Notes

- 2026-08-02 11:42Z illodev@local#849a844d — Checked the file, not just the ADRs: `ui/src/styles.css` still exists, so "the stylesheet was deleted" reads wrong at a glance. What was deleted is the bespoke *system* — the path was reused. The file is now 219 lines whose header opens "The design system of the third migration (ADR-0005): shadcn/ui on Tailwind v4, zinc as published", it imports `tailwindcss`, `tw-animate-css` and `shadcn/tailwind.css`, and `ui/src/components/ui/` holds the generated registry. ADR-0001 says "No CSS framework" and names `test/design-system.test.mjs`, which is now `.ts` and asserts the opposite direction. The ADR is obsolete on every clause.

## Activity

- 2026-08-02 11:46Z illodev@local#849a844d · backlog → done
