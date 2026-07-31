---
id: T-0038
title: Migrate the UI to shadcn/ui with no coexistence
status: backlog
type: epic
priority: high
area: ui
created: 2026-07-31
updated: 2026-07-31
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
