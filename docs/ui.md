# The interface

The UI is a React application in `ui/`, compiled by Vite into `dist/ui` and
served by the same `node:http` server that answers the API. It ships
precompiled: `files` publishes `dist`, so nothing the interface is built with
reaches a consumer's `node_modules`.

## Zero runtime dependencies is a published guarantee

`dependencies` is exactly `@types/node`, and it is there only because the
published `.d.ts` files reference `node:` types. React, Radix, Tailwind and
Lucide are all `devDependencies`.

This is enforced, not documented and hoped for. `test/dependencies.test.mjs`
asserts the exact contents of `dependencies`, and also that there are no
`peerDependencies`, `optionalDependencies`, `bundleDependencies`, or install
hooks that would smuggle a tree in past that check.

The guard exists because `shadcn add` writes its imports into `dependencies` by
default. One un-corrected run would publish Radix, Lucide and CVA into every
consumer's install, and nothing about the repository would look wrong. Install
what a component needs yourself, with `-D`, before running `add`.

`pnpm run smoke:package` goes further: it packs the tarball, installs it in a
clean consumer, and checks that React is absent from the resulting tree.

## Two design systems, on purpose

The interface is migrating to [shadcn/ui](https://ui.shadcn.com) on a Radix
base (`ADR-0005`). During the migration both systems are live at once, and the
arrangement in `ui/src/styles.css` is what keeps that from being painful:

- Everything from the framework — Preflight, the theme, the utilities — is
  declared **inside a layer**.
- The original hand-written design system is **unlayered**.

Unlayered CSS beats layered CSS in the cascade regardless of specificity. A
view nobody has touched therefore keeps its original appearance with no
`!important` anywhere, and migrating a component means deleting its legacy
rules rather than fighting them.

The same fact has a sharp edge: a legacy **element** selector will silently
outrank a migrated component. `button { color: inherit }` did exactly that, and
the first shadcn button rendered with body-text colour on a near-black
background. `test/design-system.test.mjs` fails if a bare `button` rule that
sets a contested property does not exclude `[data-slot="button"]`.

### Things that are specific to this build

- **`1rem` is 14px.** `:root` sets `font: 14px/1.5` for density, so every size
  token in the registry lands 12.5% smaller than upstream designed it — `h-8`
  is 28px here, not 32. The components sit correctly in this interface; the
  numbers just cannot be compared against shadcn's own documentation directly.
- **Themes switch on `data-theme`, not `.dark`.** The registry assumes the
  class. `styles.css` declares both, otherwise generated components stay in
  their light palette while the page around them goes dark, with no error.
- **Registry tokens carry an `--sh-` prefix.** The two systems share the names
  `--radius`, `--border`, `--accent` and `--muted`, and `--muted` is a text
  colour in one and a surface in the other. `@theme inline` maps `--color-*` at
  the prefixed sources, so registry components work untouched.
- **Radii come from this project's scale** (4/6/8/12), not the registry's
  single `--radius`. One scale, rather than two that nearly agree.
- **Preflight's losses are given back explicitly.** The reset strips heading
  weight and list markers, and the design system was written on top of browser
  defaults — so importing it flattened every heading that had not named a
  weight and unstyled every rendered Markdown list.

### Where components live

- `ui/src/components/ui/` is the registry. Generated, replaced wholesale by
  `shadcn add`, never hand-edited — a local change there is discarded by the
  next `add`, silently.
- `ui/src/components/domain/` is the opposite: the virtual table, the kanban,
  the Gantt and the record tree. The registry does not provide these and never
  will; they carry this project's own decisions about how work is displayed.
- Everything else in `ui/src/components/` is application glue — the drawer, the
  editors, the palette — assembled from both.

`test/design-system.test.mjs` fails if a registry file imports from `domain/`.

### Adding a component

```sh
pnpm dlx shadcn@latest add dialog
pnpm add -D <whatever it pulled in>   # never plain `add`
node --test test/dependencies.test.mjs
```

The CLI resolves `@/` from the **root** `tsconfig.json`, not `ui/tsconfig.json`.
Without the `paths` entry there it writes components into a literal `@/`
directory beside `package.json`.

## Demo builds

`pnpm run build:demo` produces `dist/demo`, a static bundle that replays a
snapshot of this repository's own workspace with in-memory mutations. It has no
server behind it, so **every view must reach the network through `ui/src/api.ts`**.
A component calling `fetch` directly gets a 404 that its own catch swallows, and
the feature is simply absent from the hosted demo — which is how the presence
strip and the command palette were both silently dead there.
`test/demo-parity.test.mjs` fails if any view does this.
