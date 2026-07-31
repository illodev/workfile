# The interface

The UI is a React application in `ui/`, compiled by Vite into `dist/ui` and
served by the same `node:http` server that answers the API. It ships
precompiled: `files` publishes `dist`, so nothing the interface is built with
reaches a consumer's `node_modules`.

## Zero runtime dependencies is a published guarantee

`dependencies` is exactly `@types/node`, and it is there only because the
published `.d.ts` files reference `node:` types. React, Radix and Lucide are
all `devDependencies`.

This is enforced, not documented and hoped for. `test/dependencies.test.ts`
asserts the exact contents of `dependencies`, and also that there are no
`peerDependencies`, `optionalDependencies`, `bundleDependencies`, or install
hooks that would smuggle a tree in past that check.
`test/design-system.test.ts` asserts the same list a second time, from the
other direction.

The guard exists because a component generator writes its imports into
`dependencies` by default. One un-corrected run would publish Radix, Lucide
and CVA into every consumer's install, and nothing about the repository would
look wrong. Install what a component needs yourself, with `-D`.

`pnpm run smoke:package` goes further: it packs the tarball, installs it in a
clean consumer, and checks that React is absent from the resulting tree.

## The stylesheet is the design system

There is no framework underneath this interface (`ADR-0004`). Two shadcn
migrations were attempted and both were reverted; `ui/src/styles.css` now
carries the whole system — the tokens and the component classes, in one file,
ported 1:1 from the normative spec `Workfile - Rediseño.dc.html`.

`test/design-system.test.ts` keeps it that way, and its assertions are the
real contract:

- **No framework reaches the stylesheet.** No `@import "tailwindcss"`, no
  `@import "shadcn"`, no `@source`, no `@theme`. The typeface is bundled
  through `@fontsource-variable`, so the package carries its own Geist rather
  than requesting one from a CDN.
- **The framework packages stay out of `package.json`, by name** —
  `tailwindcss`, `@tailwindcss/vite`, `shadcn`, `tw-animate-css`,
  `class-variance-authority`, `tailwind-merge`, `clsx`, `cmdk`, `sonner`,
  `react-resizable-panels`, `next-themes`.
- **No component imports through the `@/` alias or references
  `components/ui/`.** Both were deleted with the second migration.
- **Components name tokens, never colours.** A literal `#hex`, `rgb()`,
  `hsl()` or `oklch()` in a component fails the suite. Status, priority and
  severity are the `--status-*`, `--priority-*` and `--sev-*` custom
  properties, applied inline through the helpers in `ui/src/theme.ts`.
- **Every `var()` a component references is declared.** The check is a set
  difference against the stylesheet, because a typo'd token does not error —
  the declaration is silently dropped and renders as "transparent" or
  "inherits something odd", never as a message.
- **The dark palette is keyed to `data-theme`**, which is what the app toggles
  on the root element, and it sets `color-scheme: dark`.

### Things that are specific to this build

- **The base is 13px**, set on `body` for density. Sizes are chosen against
  that base, so numbers here do not compare directly with any framework's
  documentation.
- **Themes switch on `data-theme`**, not a class. `[data-theme="light"]` rides
  with `:root`, and `[data-theme="dark"]` overrides the palette.
- **Row height is the one density token**: `--row-h`, with a taller value
  under `:root[data-density="comfortable"]`.
- **Radii are literal values**, not a token — the stylesheet writes `6px` or
  `7px` per component. Colours are the opposite and must always be tokens;
  the tests enforce that asymmetry, so do not assume it applies to sizes.
- **`radix-ui` and `lucide-react` are still devDependencies and still used** —
  behaviour primitives and icons, not a look. They are not the rejected layer.

### The vocabulary

The header of `styles.css` lists every class family, and it is the place to
look before inventing one:

```text
layout     .app .topbar .app-body .nav .main .view-head .inspector .ledger
text       .mono .dim .faint .overline .truncate
controls   .btn .btn-accent .iconbtn .chip .kbd .searchbtn .input .select
patterns   .tile .dot .meter .metagrid .reflink .callout .facet .grid-table
```

### Where components live

- `ui/src/components/domain/` holds the virtual table, the kanban, the Gantt
  and the record tree. These carry this project's own decisions about how work
  is displayed.
- Everything else in `ui/src/components/` is application glue — the drawer,
  the editors, the palette.
- `ui/src/kit.tsx` is where the Radix primitives are wrapped.

### Adding a surface

There is no generator. Reuse a class family above, or add a named token and a
named class to `styles.css` and use it:

```sh
node --test test/design-system.test.ts    # tokens declared, no colour literals
node --test test/dependencies.test.ts     # nothing new reached dependencies
```

Reaching for a component library is the third migration. Read `ADR-0004`
first — it records what the first two cost.

## Demo builds

`pnpm run build:demo` produces `dist/demo`, a static bundle that replays a
snapshot of this repository's own workspace with in-memory mutations. It has no
server behind it, so **every view must reach the network through `ui/src/api.ts`**.
A component calling `fetch` directly gets a 404 that its own catch swallows, and
the feature is simply absent from the hosted demo — which is how the presence
strip and the command palette were both silently dead there.
`test/demo-parity.test.ts` fails if any view does this.
