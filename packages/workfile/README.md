# @illodev/workfile

Repository-native protocol and local MCP server for **Work**, **Docs**,
**History** and durable project **Memory** — everything lives as Markdown with
restricted frontmatter inside your repository, owned by git, readable without
any tool.

This package ships the complete surface: the `workfile` CLI, the programmatic
core, a local HTTP API, a precompiled web interface and an MCP server for
agents. It depends on nothing but `@types/node`; installing it adds no runtime
tree to your project.

```bash
npm install -D @illodev/workfile     # or pnpm add -D / yarn add -D / bun add -d
npx workfile init
npx workfile ui                      # local interface
npx workfile mcp                     # MCP server (stdio)
```

## What you get

- **Work** — cards (`T-NNNN`) with statuses, areas, claims with actor and
  scope, hierarchy and archival. Sequential IDs heal deterministically after
  parallel-clone collisions (`workfile card renumber --duplicates`).
- **Docs** — indexed read-only documents from your existing Markdown plus
  managed documents with stable IDs and review intervals.
- **History** — changelog fragments merged into releases; the rendered
  changelog is derived, never hand-edited.
- **Memory** — learnings, decisions, incidents, conventions and context as
  typed collections agents can query before repeating a mistake.
- **Agents** — one canonical protocol synchronized into `AGENTS.md`,
  `CLAUDE.md`, Cursor and Copilot as compact managed blocks; `workfile agents
  context --card T-0001` returns a bounded context bundle.
- **Doctor** — `workfile doctor` validates the whole workspace and exits
  non-zero on errors, which makes it a natural CI and pre-commit gate.
- **Search** — one query grammar across CLI, HTTP, MCP and UI; hybrid
  semantic ranking activates only when the repository explicitly declares a
  provider such as
  [`@illodev/workfile-search-local`](https://www.npmjs.com/package/@illodev/workfile-search-local).

Workfile never sends repository content to a network service by itself.

## Documentation

Shipped inside this package under `docs/`:

- [Getting started](docs/getting-started.md) — install, initialize, first loop.
- [CLI reference](docs/cli.md) — every command, the query grammar, exit codes.
- [MCP server](docs/mcp.md) — tools, resources, prompts, the Claude Code plugin.
- [HTTP API](docs/http-api.md) — endpoints, conventions, stable error codes.
- [Interface](docs/ui.md) — the local UI and the static demo build.
- [Security](docs/security.md) — threat model of the local server.
- [Specification](docs/SPEC.md) — the normative protocol contract.

## Repository

Part of the [illodev/workfile](https://github.com/illodev/workfile) monorepo —
a pnpm workspace whose private root carries the version every published
package ships with, in lockstep. The project develops itself with its own
protocol: the cards, changelog and memory of this package's development live
in the repository's `.project/` directory.

## License

[MIT](https://github.com/illodev/workfile/blob/main/LICENSE)
