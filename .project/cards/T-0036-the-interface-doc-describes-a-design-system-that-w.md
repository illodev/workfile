---
id: T-0036
title: The interface doc describes a design system that was deleted
status: done
type: bug
priority: high
area: docs
created: 2026-07-31
updated: 2026-07-31
scope: [packages/workfile/docs/ui.md, packages/workfile/ui/src, packages/workfile/test, .project/memory/decisions]
---
## Intent

`packages/workfile/docs/ui.md` ("The interface", `PATH-FC5FCAFC7AD8`, published under `files: ["docs"]`) documents a migration to shadcn/ui on a Radix base as if it were in progress. That migration was reverted. Roughly two thirds of the document — everything between "Two design systems, on purpose" and "Demo builds" — describes a design system that no longer exists, and its "Adding a component" recipe actively breaks the build.

`test/design-system.test.ts:29` records the real position: *"The stylesheet is the whole design system (ADR-0010). Two migrations proved that a framework underneath this interface ends up being fought, not used."* The tests now enforce the framework's **absence**.

Audited 2026-07-31 against `c882325`.

## Claims that are false

- **`ADR-0005` (line 30) does not exist.** `.project/memory/decisions/` holds ADR-0001, ADR-0002 and ADR-0003 only. The decision that actually governs the interface is ADR-0010 — see the separate gap below.
- **"migrating to shadcn/ui … both systems are live at once" (29–31).** `test/design-system.test.ts:46` asserts `tailwindcss`, `@tailwindcss/vite`, `shadcn`, `tw-animate-css`, `class-variance-authority`, `tailwind-merge`, `clsx`, `cmdk`, `sonner`, `react-resizable-panels` and `next-themes` are all absent from `package.json`, and they are.
- **The layered-Preflight arrangement (33–40).** `test/design-system.test.ts:36` asserts `styles.css` contains no `@import "tailwindcss"`, no `@import "shadcn"`, no `@source` and no `@theme`. It contains none.
- **The `button` / `[data-slot="button"]` guard (42–46).** No such assertion exists. The file's actual tests are: no framework in the stylesheet, framework dependencies stayed removed, no component imports a registry or the `@/` alias, no colour literals in components, every referenced `var()` is declared, the dark palette follows the theme switch, and fonts are served with an acceptable type.
- **"`1rem` is 14px … `:root` sets `font: 14px/1.5`" (50–53).** The stylesheet sets `font-size: 13px`. Every derived number in that bullet is wrong.
- **`--sh-` token prefix and `@theme inline` mapping (57–60).** `@theme` is asserted absent; no `--sh-` token exists.
- **"`ui/src/components/ui/` is the registry" (70–72).** The directory does not exist. `test/design-system.test.ts:79` calls it "the deleted shadcn registry" and fails any source that references the path.
- **"fails if a registry file imports from `domain/`" (79).** Inverted. The test fails if *any* component references `components/ui/` or imports through `@/` at all.
- **"Adding a component" (83–91).** `pnpm dlx shadcn@latest add dialog` installs packages the test suite forbids and writes into a deleted directory through a deleted alias. Following this section breaks `pnpm run check`.
- **"React, Radix, Tailwind and Lucide are all `devDependencies`" (11–12).** Tailwind is gone. `radix-ui` and `lucide-react` are real devDependencies and genuinely imported by `ui/src/kit.tsx`, `ui/src/main.tsx` and `ui/src/components/PropertyEditor.tsx`.

## Claims that are still true — keep them

- The opening (3–6): a React app in `ui/`, compiled by Vite into `dist/ui`, published precompiled because `files` ships `dist`. Confirmed at `vite.config.mjs:28`.
- The whole zero-runtime-dependencies section (8–25). `dependencies` is exactly `{"@types/node": "26.1.2"}`, asserted twice over — `test/dependencies.test.ts` and `design-system.test.ts:67` — and `pnpm run smoke:package` does pack, install and check React's absence. Only the shadcn framing of *why* the guard exists (19–22) is now historical; the guard itself is load-bearing.
- Themes switch on `data-theme` (54), at `styles.css:33` and `:66`. The stated reason — that the registry assumes `.dark` — is obsolete, but the fact is not.
- The entire "Demo builds" section (93–101). `build:demo` writes `dist/demo` (`vite.config.mjs:28`), `ui/src/api.ts` is the required network path, and `test/demo-parity.test.ts` exists and enforces it.

## Second-order gap: ADR-0010 is unrecorded

Four source files cite `ADR-0010` as the decision behind the current interface — `ui/src/styles.css:2`, `ui/src/theme.ts:4`, `test/design-system.test.ts:29`, `test/tokens.test.ts:90` — and no such record exists in `.project/memory/decisions/`. The reasoning that killed two framework migrations lives only in a test comment. ADR-0001 ("The UI implements the bespoke design spec in `design/redesign.dc.html`") is adjacent but does not cover it.

Write ADR-0010 from what the tests encode, so the citations resolve and the next person proposing Tailwind finds the answer before starting migration number three. Note that the ID must be ADR-0010 to match four existing citations, which is ahead of the current ADR-0003 sequence — check how `memory add` allocates IDs before assuming it can be forced.

## Acceptance

- `ui.md` describes the bespoke stylesheet as the design system, with no shadcn registry, no Tailwind layer and no `--sh-` tokens.
- "Adding a component" explains the real path: edit `styles.css` and the component, no generator.
- Every test named in the doc asserts what the doc says it asserts.
- `ADR-0010` resolves to a real record.
- Consider a test that fails when a doc names a `test/*.test.ts` file that does not exist — the cheap half of this class of drift.

## Activity

- 2026-07-31 09:12Z claude-opus-4df73848 · claimed
- 2026-07-31 09:21Z claude-opus-4df73848 · doing → done
- 2026-07-31 09:21Z claude-opus-4df73848 · released

## Notes

- 2026-07-31 09:24Z claude-opus-4df73848 — Rewritten and verified.

  **The doc.** `docs/ui.md` now describes the bespoke stylesheet as the whole design system. The opening, the zero-runtime-dependencies section and the demo-builds section were kept verbatim — all three were verified true. Everything between them was replaced: the shadcn migration narrative, the layered-Preflight arrangement, the `--sh-` tokens, the registry directory and the `shadcn add` recipe are gone. The new middle states the six assertions `test/design-system.test.ts` actually makes, and points at the class vocabulary in the `styles.css` header for anyone adding a surface.

  **Two claims I carried over from the old doc and then caught.** Both were wrong and both are now corrected in place:

  - "`1rem` is 14px, `:root` sets `font: 14px/1.5`" — the base is `13px` and it sits on `body`, not `:root`.
  - "Radii come from this project's scale (4/6/8/12), one scale named once" — there is no radius token at all. The stylesheet writes literal values, most often `7px` and `6px`. The doc now states that, and flags the asymmetry with colours, which must always be tokens.

  Also corrected: Tailwind was still listed among the devDependencies. It is gone; `radix-ui` and `lucide-react` remain and are genuinely used by `kit.tsx`, `main.tsx` and `PropertyEditor.tsx`.

  **The dangling ADR.** `ADR-0010` could not be created at that ID — `memory add` allocates sequentially and the workspace is at ADR-0003. Rather than hand-write frontmatter, the decision was recorded as **ADR-0004** ("The stylesheet is the whole design system: no framework under the interface") and the four citations were renumbered to it: `ui/src/styles.css`, `ui/src/theme.ts`, `test/design-system.test.ts`, `test/tokens.test.ts`.

  The `styles.css` header also cited `ADR-0009`, `T-0100` and `T-0101` for the two rejected migrations. None of the three exists — Workfile's own graph already recorded `ADR-0009` as a mention with `exists: false` in the demo snapshot. That history is now written into ADR-0004 itself, and the comment describes the two reverted migrations without inventing record IDs.

  **Regression guard.** New `test/documentation.test.ts` asserts that every `test/*` and `scripts/*` path named in the shipped docs exists, and that neither the docs nor the shipped sources teach the removed `project` binary. Proved it catches both: appending a fake `test/nonexistent.test.ts` reference and a `project ci sync` block to `docs/cli.md` failed tests 1 and 2 with the exact file and reason; reverted and green again.

  The strict ratchet rejected the first version of that file — 4 errors in a file that must be clean, from `const result = []` inferring `never[]` and the `DOCS` tuples widening to `(string | URL)[]`. Fixed with real annotations rather than `any`, per the ratchet's own instruction.

  **Runtime evidence.** `pnpm run check` exits 0: build, build:plugin, strict ratchet and 165 + 7 tests, 0 failures. Test count rose from 162 to 165, the three new documentation guards.
