---
id: ADR-0004
title: "The stylesheet is the whole design system: no framework under the interface"
status: superseded
created: 2026-07-31
updated: 2026-07-31
superseded_by: [ADR-0005]
---
## Context

The interface twice tried to sit on a component framework, and twice the framework was removed. Both attempts followed the same arc: the registry's tokens and the project's own tokens shared names with different meanings, a legacy element selector silently outranked a generated component, and every visual change turned into an argument with a cascade written elsewhere. The second attempt reached the point of shipping `class-variance-authority`, `tailwind-merge`, `clsx`, `cmdk`, `sonner`, `react-resizable-panels` and `next-themes` before it was reverted.

The normative design is the owner's own: `Workfile - Rediseño.dc.html`, already a complete look with its oklch palette, the Geist and Geist Mono pairing, a 13px base and a named pattern for every surface. A framework was never adding a design here — it was translating one that already existed.

This record was written on 2026-07-31, well after the fact. Four source files had been citing `ADR-0010` for the decision and no such record existed; `ADR-0009`, `T-0100` and `T-0101` are cited in the same comments and are equally unresolvable, carried over from a numbering this workspace never had. Workfile's own graph already flagged them: the demo snapshot records `ADR-0009` as a mention with `exists: false`.

Confirmed 2026-07-31: the owner verified both reverted migrations are real history from the predecessor codebase, before this repository's initial commit — which is why this git history shows no trace of them. The plan for the third migration, made under this record's intended friction, is [[ADR-0005]].

## Decision

The interface has no framework underneath it. `ui/src/styles.css` is the entire design system: the tokens and the component classes, in one file, ported 1:1 from the normative spec.

The rules that follow from it, each one enforced by `test/design-system.test.ts` rather than by memory:

- No framework import reaches the stylesheet — no `@import "tailwindcss"`, no `@import "shadcn"`, no `@source`, no `@theme`. The typeface is bundled through `@fontsource-variable`, not linked from a CDN.
- The framework packages stay out of `package.json`, by name. `dependencies` is exactly `@types/node`, so the published package carries no runtime tree at all.
- No component imports through the deleted `@/` alias or references the deleted `components/ui/` registry.
- Components name tokens, never colours. Status, priority and severity are the `--status-*`, `--priority-*` and `--sev-*` custom properties, applied inline through the helpers in `ui/src/theme.ts`.
- Every `var()` a component references is declared in the stylesheet, checked as a set difference — a typo'd token does not error, it silently drops the declaration.
- Themes switch on `data-theme` on the root element.

Adding a surface means using the existing vocabulary — the layout, text, control and pattern class families listed at the top of `styles.css` — or adding a named token and a named class to that file. There is no generator.

## Consequences

- A visual change is an edit to a named token or a named class. That is the whole point: the cost of the bespoke system is paid once, in the file, instead of continuously in cascade conflicts.
- `radix-ui` and `lucide-react` remain devDependencies and are genuinely used — behaviour primitives and icons, not a look. They are not the rejected layer, and the tests do not forbid them.
- Proposing a framework again means arguing with two reverted migrations and this record, which is the intended friction. The lesson is not "frameworks are bad": it is that adopting one means adopting its look wholesale, and this project already owns a complete look.
- The stylesheet is long by design and will keep growing. That is accepted; a single file that can be read top to bottom beats a distributed system whose behaviour emerges from layer order.
- The guard against `shadcn add` writing into `dependencies` stays load-bearing even with the registry gone: it is what keeps an experiment from publishing React into every consumer's install.
