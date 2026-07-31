---
id: T-0038
title: Migrate the UI to shadcn/ui with no coexistence
status: done
type: epic
priority: high
area: ui
created: 2026-07-31
updated: 2026-07-31
scope: [packages/workfile/ui, packages/workfile/test, packages/workfile/docs/ui.md, packages/workfile/package.json, packages/workfile/vite.config.mjs, packages/workfile/tsconfig.json]
---
## Intent

Execute the third shadcn migration under ADR-0005's rules. The normative spec is `design/shadcn-redesign.dc.html`; the argument and constraints are `design/shadcn-migration-note.dc.html`. The two previous attempts died of layered coexistence in the predecessor codebase; this one forbids the layer: the bespoke stylesheet is deleted in the same PR that introduces shadcn.

## Sequencing constraints, in dependency order

1. **Prove density first.** The note claims the 40px compact Data Table row preserves the Explorer's scanning density. Demonstrate it on the real Explorer with the real workspace (36+ cards) in a spike branch *before* anything is deleted — after the stylesheet is gone there is no cheap way back. This is the go/no-go gate.
2. **Tokens before components.** Land the three semantic namespaces (`--status-*`, `--priority-*`, `--sev-*`) in their registry-safe location, port `theme.ts` helpers to them, then generate components against a base that already has them.
3. **The big PR.** Generate the registry (`components/ui/`), migrate every view, delete `styles.css` and the bespoke vocabulary, move every CLI-installed package to `devDependencies` in the same commit.
4. **Tests switch sides in the same PR.** `design-system.test.ts` asserts the new direction (registry present, no colour literal outside the semantic namespaces, no `.btn`/`.chip`/`.tile` survivors); the forbidden-package list retires; `dependencies.test.ts` is NOT touched and must stay green throughout.
5. **Docs follow.** `docs/ui.md` rewritten against the new reality; `documentation.test.ts` keeps its file references honest.

## Decisions already made (do not reopen)

- Radix primitives, not Base UI (`radix-ui` already used in kit.tsx, main.tsx, PropertyEditor.tsx).
- Zinc look as-is: 14px base, 0.625rem radius. The 13px base and the brand-blue primary are accepted losses.
- UI copy stays **English** — the mockup's Spanish is incidental, not normative.
- Native select in table rows (shadcn Native Select), never a portal select mid-row.
- Every mapped entry verified against ui.shadcn.com 2026-07-31: Sidebar, Breadcrumb, Badge, Input Group, Kbd, Data Table, Checkbox, Native Select, Button Group, Progress, Field, Item, Attachment, Card, Empty, Alert, Command, Spinner — plus **Typeset** (`/docs/typeset`, the CSS system for rendered Markdown; use it for card bodies, Triage and Docs articles) and the **scroll-fade** utility (`/docs/utils/scroll-fade`) for Flow and Memory lists. Both live outside the components index — sweep the whole docs tree, not just /docs/components, when checking the catalog.

## Acceptance

- `styles.css` (bespoke) no longer exists; no view renders through the old vocabulary.
- `dependencies.test.ts` green and unedited: `dependencies` is exactly `@types/node`.
- Rewritten `design-system.test.ts` green: registry present, semantic-token discipline, no bespoke class survivors.
- Explorer density proven equal-or-better at the 40px compact row, with the comfortable/compact toggle working.
- Demo build parity intact (`demo-parity.test.ts`), smoke:package green — React still absent from a consumer's tree.
- On merge: `workfile memory supersede ADR-0004 --by ADR-0005`, changelog fragment, `docs/ui.md` rewritten.

## Activity

- 2026-07-31 10:17Z claude-fable-4df73848 · claimed
- 2026-07-31 11:09Z claude-fable-4df73848 · doing → review
- 2026-07-31 11:19Z claude-fable-4df73848 · review → done
- 2026-07-31 11:19Z claude-fable-4df73848 · released

## Notes

- 2026-07-31 12:58Z claude-fable-4df73848 — Implementation complete on branch `shadcn-migration`, three commits: foundation (`ab8f0c6`-era), full view migration (`158e512`), close-out. Held in `review` pending the owner's merge — ADR-0005's supersede of ADR-0004 executes on landing, not before.

  **How it ran.** Two orchestrated phases over the accepted design package. *Understand*: 12 parallel scouts mapped every view, the 1560-line stylesheet, the mockup and the test contracts (473k tokens). *Migrate*: 9 disjoint units in parallel, each re-verified by a second agent against the files rather than the reports (1.73M tokens, 18 agents, 0 errors). Sequencing followed the card: foundation → tokens → views → tests switch sides → docs.

  **The verify passes earned their cost.** They caught the registry Table wrapper silently detaching Explorer's sticky headers (fixed via `[&>[data-slot=table-container]]:overflow-visible`), and that `baseUrl` in `ui/tsconfig.json` aborts TypeScript 7 with TS5102 before checking a single file — every per-unit typecheck had been vacuously green until it was removed.

  **Density gate (go).** Measured on the served UI against this real workspace, 1600×1000 viewport, 38 rows: compact `--row-h` 40px → 20 rows visible; comfortable 48px → 17; the old bespoke 34px would have shown 24. The −17% against the old system is the accepted loss ADR-0005 names (the 14px base); against an uncompacted shadcn default (~52px, ~16 rows) the compact variant recovers +25%. Both densities measured live, switching on `data-density` alone.

  **Behaviour preserved, verified per unit against HEAD:** keyboard-carry protocol with aria-live announcements (Boards), windowed virtual scrolling with the data-density MutationObserver (Explorer), revision-guard conflict flow (Inspector), optimistic patch/rollback + URL sync + SSE reloads (shell), 120ms cancellable search debounce (palette). Native selects stay in table rows; the palette moved to cmdk with state held above the dialog so query survives close.

  **Runtime evidence.** `pnpm run check` exit 0 — 174 tests, 0 failures, strict ratchet clean (it caught and forced the fix of 1 strict error in the rewritten test). `smoke:package`: tarball installs clean, React absent from the consumer tree. `build:demo` compiles. Full screenshot sweep of all 10 views, light + dark, real workspace served by the real binary. Invariants passed UNEDITED: `dependencies.test.ts`, `demo-parity.test.ts`, `documentation.test.ts` (over the rewritten `docs/ui.md`).

  **Debt, recorded not hidden:** the fixed 3 design-system failures were real mid-flight states, not test looseness; `tokens.test.ts`'s theme-parity check was green-but-vacuous before this branch (parser compared light with itself) and now walks braces; there is still no in-UI control to set `data-density` — follow-up card needed if the toggle should exist; the sticky-header fix keys off the registry's `data-slot="table-container"` attribute and would silently revert if the registry renames it (noted in Explorer's code comment).
- 2026-07-31 11:19Z claude-fable-4df73848 — Merged to main as PR #9 (fc69b96). ADR-0004 formally superseded by ADR-0005 via memory supersede, closing the loop the ADR deferred to landing. The hosted demo and the README media still show the bespoke UI; screenshot and video refresh runs next, outside this card's scope.
