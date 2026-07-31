---
id: ADR-0005
title: "The third shadcn migration: no coexistence, the framework look wins"
status: accepted
created: 2026-07-31
updated: 2026-07-31
supersedes: [ADR-0004]
---
## Context

[[ADR-0004]] demands that a third framework migration argue against the two reverted ones. On 2026-07-31 the owner confirmed both reverted attempts are real history — they happened in the predecessor codebase, before this repository's initial commit, which is why no trace of them exists in this git history — and delivered that argument as a design package: `design/shadcn-migration-note.dc.html` (the response to ADR-0004) and `design/shadcn-redesign.dc.html` (the normative mockup). The owner's summary of the previous attempts, made without a design-first spec: "fue horrible".

The note's diagnosis of both failures is **coexistence by layers**: the bespoke and generated systems lived side by side, tokens shared names with different meanings (Workfile's `--accent` was brand blue; shadcn's, a hover grey), and a legacy element selector always beat a generated class in the cascade. The documented result: cards closed as done with dozens of native buttons and the hand-written CSS intact underneath.

The mockup renders a fictional future workspace (v0.7.0-rc.2, 1,244 records). Its record IDs — ADR-0009, T-0100, CONV-0003, CHG-0082, LRN-0008 — are set dressing, not citable records; copying them into source comments is what left the dangling citations T-0036 cleaned up.

## Decision

Migrate the UI to shadcn/ui under the note's rules:

1. **No coexistence.** The bespoke stylesheet is deleted in the same PR that introduces shadcn. There is no period with two competing cascades; a view is migrated or it does not build.
2. **shadcn's look wins, with one named exception.** The zinc tokens are adopted as-is (14px base, 0.625rem radius, xs shadows). Workfile contributes only the semantic namespaces `--status-*`, `--priority-*` and `--sev-*`, which shadcn does not have, declared where no registry write can touch them. No re-tinting of generated components.
3. **Radix stays.** `radix-ui` is already a used devDependency and every shadcn component still publishes for Radix. Switching primitive libraries in the same move as the design system would double the risk.
4. **The zero-runtime-dependency guarantee is untouchable.** Everything the CLI installs moves to `devDependencies` in the same commit. `dependencies.test.ts` is not edited: it keeps asserting that `dependencies` is exactly `@types/node`.
5. **The tests switch sides, they do not disappear.** `design-system.test.ts` is rewritten to assert the opposite direction: components live in `components/ui/`, no colour literal outside the three semantic namespaces, and no survivor of the bespoke vocabulary (`.btn`, `.chip`, `.tile`, …). The forbidden-package list (`cmdk`, `clsx`, `tailwind-merge`, …) is retired as part of the same rewrite — the ⌘K palette needs `cmdk`.
6. **Domain conventions survive the framework.** Native select in table rows (never a portal select mid-row), implemented with shadcn's Native Select. Table density returns via the 40px compact row variant and the comfortable/compact toggle, not a fork of the component.

**Component map, verified against ui.shadcn.com on 2026-07-31.** Every component the note maps exists in the current catalog: Sidebar, Breadcrumb, Badge, Input Group, Kbd, Data Table, Checkbox, Native Select, Button Group, Progress, Field, Item, Attachment, Card, Empty, Alert, Command, Spinner. Two entries live outside the components index and are equally real: **Typeset** (`/docs/typeset`, a CSS system that styles everything inside a `typeset` container — the natural fit for Workfile's rendered Markdown bodies) and the **scroll-fade** utility (`/docs/utils/scroll-fade`) the note assigns to Flow and Memory lists.

**Accepted losses**, named by the note so nobody relitigates them mid-migration: the 13px base, the brand blue as primary action colour, and the top-to-bottom readability of a single `styles.css`.

## Consequences

- ADR-0004 remains in force until the migration lands — the tests it describes are still the shipped reality. When the migration PR merges, supersede it: `workfile memory supersede ADR-0004 --by ADR-0005`.
- `docs/ui.md` gets rewritten again, one release after T-0036 rewrote it. Accepted: the doc follows the code, and `documentation.test.ts` keeps its named files honest either way.
- The mockup is normative for structure, components and behaviour — **not for copy language**. It renders in Spanish; the shipped UI is and stays English unless the owner decides otherwise ([[workfile-records-in-english]] logic applies to the UI's public surface).
- The density claim — that the 40px compact row preserves today's Explorer scanning density — is asserted by the note, not demonstrated by the mockup. The migration must prove it on the real Explorer with real data before the bespoke stylesheet is deleted, because after deletion there is no cheap way back.
- `pnpm dlx shadcn add` regains a place in the workflow, and with it the guard rails: registry writes go through `-D` corrections exactly as `docs/ui.md` will re-teach.
