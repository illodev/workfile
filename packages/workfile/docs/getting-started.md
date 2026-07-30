# Getting started

Workfile coordinates **Work, Docs, History and durable Memory** as markdown
files inside your repository. This guide takes you from zero to a working workspace.

## Install

```bash
pnpm add -D @illodev/workfile     # per repository (recommended)
pnpm workfile doctor              # dependency bins run through pnpm / npx

pnpm add -g @illodev/workfile     # or globally: `project` lands on your PATH
```

`pnpm dlx @illodev/workfile init` works for one-shot initialization, but keep the
package installed afterwards — that is what makes the `project` commands resolve.

## Initialize a workspace

```bash
workfile init
```

The initializer detects your package manager, monorepo folders, likely card areas,
documentation sources, agent environments and CI providers. Every answer can be
given as a flag for automation, and `--dry-run` prints the exact filesystem plan:

```bash
workfile init --yes --language es --agents agents-md,claude --ci github
workfile init --dry-run --json
```

You get a `project.config.mjs` at the root and a `.project/` directory:

```text
project.config.mjs
.project/
├── VERSION
├── cards/            # Work records (T-NNNN), archive/ for closed history
├── assets/           # files attached to cards
├── docs/             # managed documents (DOC-NNNN)
├── changelog/        # unreleased/ fragments and releases/
├── memory/           # learnings, decisions, incidents, conventions, context
└── agents/           # canonical agent instructions
```

All of it is plain markdown with frontmatter — commit everything except
`.project/.cache/` (the initializer adds it to `.gitignore` for you).

## The daily loop

```bash
workfile ui                       # local board at http://127.0.0.1:4747
workfile card create --title "Ship the login page" --area web
workfile card claim T-0001 --actor agent-a1 --scope apps/web
workfile card transition T-0001 review --actor agent-a1
```

Agents claim cards with scoped paths so two of them never touch the same files;
claims release automatically when a card leaves `doing`.

As work lands, record it:

```bash
workfile changelog add --title "Login page" --type added --area web
workfile memory add learning --title "Session cookies need SameSite=Lax"
workfile doc create --title "Auth runbook" --kind runbook
```

And when you cut a version, the accumulated fragments become a release:

```bash
workfile changelog preview
workfile changelog release 1.4.0
workfile changelog render --visibility public --write   # regenerates CHANGELOG.md
```

## Keeping it healthy

```bash
workfile doctor --json
```

The doctor validates every collection: broken references, stale docs, expired
context, incidents missing resolution metadata, unmanaged agent instructions.
The same diagnostics power the Health view in the UI.

## Where to go next

- [CLI reference](cli.md) — every command and flag.
- [HTTP API](http-api.md) — the same operations over REST.
- [MCP server](mcp.md) — expose the workspace to AI agents.
- [SPEC](SPEC.md) — the normative protocol specification.
