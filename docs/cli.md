# CLI reference

Every command accepts the global options and returns stable machine-readable
errors with `--json`.

## Global options

| Option | Meaning |
| --- | --- |
| `--root PATH` | Workspace root (default: discovered from the working directory) |
| `--json` | Machine-readable output |
| `--expected-revision REV` | Reject the write when the file changed since it was read |
| `--dry-run` | Preview filesystem changes without applying them |
| `--force` | Replace conflicting generated files |
| `--read-only` | Disable MCP mutation tools |
| `--yes` | Accept initializer defaults without prompting |

Exit codes: `3` stale revision · `2` configuration error · `1` validation / not found.

## Workspace

```bash
workfile init [--root PATH] [--yes] [--dry-run] [--name NAME] [--language LANG]
workfile schema [--json]        # effective runtime schema (areas, vocabularies…)
workfile doctor [--json] [--severity error|warning] [--max-issues N] [--rebuild-cache] [--fix]
workfile ui [--host HOST] [--port PORT]
workfile search QUERY [--kind card,doc,change,release,memory] [--limit N] [--mode auto|lexical|hybrid] [--json]
```

`search` is lexical by default and becomes hybrid automatically when
`project.config.mjs` declares an integration with a semantic search provider
(`export const integrations = [...]`; `search.provider` selects one by id when
several are declared). `--mode lexical` opts out for a run; `--mode hybrid`
fails with `SEARCH_PROVIDER_UNAVAILABLE` instead of silently degrading when no
provider is available. `--json` reports which mode actually ran. Workfile never
sends repository content to a network service by itself — a provider only runs
if the repository explicitly declares it.

The first-party provider is
[`@illodev/workfile-search-local`](../packages/search-local/README.md):
on-device embeddings via transformers.js, cached by content hash, fully
offline after the first model download.

### Query grammar

One grammar, shared by the CLI, the HTTP API, MCP and the interface — the same
string returns the same answer everywhere, which it did not before.

| Form | Meaning |
| --- | --- |
| `billing retry` | free text over id, title, metadata and body, ranked |
| `"exact phrase"` | one term, not two |
| `status:doing` | field filter; narrows rather than ranking |
| `area:ui type:bug` | filters combine with AND |
| `-status:done` | negated filter |
| `-draft` | negated term |
| `tag:` / `claim:` | aliases for `tags` and `claimed_by` |

Field names are the record's own keys, so the vocabulary follows the runtime
schema rather than a second list. An unknown field matches nothing instead of
falling back to free text, which would quietly return everything.

Text is compared with diacritics folded, so `diseno` finds `Diseño`.

## Work (cards)

```bash
workfile card list [--status S] [--area A] [--type T] [--priority P] [--parent ID]
                  [--claimed-by ACTOR] [--unclaimed] [--tag TAG] [--updated-since DATE]
                  [--limit N] [--offset N] [--fields a,b] [--with-body] [--json]
workfile card show ID [--json]
workfile card create --title TITLE [--area AREA] [--type TYPE] [--priority PRIORITY]
workfile card patch ID --json-input FILE [--expected-revision REV]
workfile card claim ID --actor ACTOR [--scope PATH,PATH] [--force --reason TEXT]
workfile card release ID [--actor ACTOR] [--status next]
workfile card transition ID STATUS [--actor ACTOR]
workfile card archive ID
workfile card reopen ID [--status backlog]
workfile card reap [--dry-run] [--older-than HOURS] [--json]
workfile card renumber ID|FILE [--to T-0123] [--actor ACTOR]
workfile card renumber --duplicates [--actor ACTOR]
```

Claims carry an actor and optional path scope; the server refuses overlapping
scopes and releases the claim when a card leaves `doing`.

Sequential IDs are allocated per clone, so two branches can create the same
card ID and git merges both files without a conflict. `card renumber
--duplicates` (or `doctor --fix`) heals that deterministically: the older card
keeps the ID, the younger moves to the next free one. When the moved ID was
unique, every reference inside `.project/` is rewritten; after a collision the
references are ambiguous by construction, so they are listed under `review`
instead of being silently repointed.

Filter flags take comma-separated values (`--type bug,task`) and combine with
AND. `--json` omits the Markdown body and reports `bodyBytes` instead; ask for
it with `--with-body`, or pick exactly what you need with `--fields`. Responses
carry `total`, `offset` and `truncated`.

Options a command does not recognise are refused with `CLI_ARGUMENT_UNKNOWN`
rather than ignored, so a mistyped filter fails instead of quietly returning
everything.

A claim has a lifecycle, not just a flag. The card records `claimed_by` and
`claimed_at`; the live signal lives in `.project/.cache/activity/sessions/` and
therefore outside git, because a heartbeat written into frontmatter would leave
the working tree permanently dirty. `doctor` reports `card-claim-stale` past
`cards.claimLeaseHours` and `card-claim-orphaned` when a session stops
signalling, and `workfile card reap` releases them.

## Docs

```bash
workfile doc list [--query TEXT] [--managed] [--json]
workfile doc show ID [--json]
workfile doc create --title TITLE [--kind KIND] [--status STATUS] [--folder PATH]
workfile doc move ID --folder PATH [--expected-revision REV]
workfile doc patch ID --json-input FILE [--expected-revision REV]
```

Indexed documents (from configured globs) get deterministic `PATH-*` IDs and are
read-only; managed documents live in `.project/docs/` with `DOC-NNNN` IDs.

Managed documents are loaded recursively, so folders work even when they are
created by hand. `docs.layout` decides where new documents are written — `kind`
(the default) groups them into a folder named after the document kind, `flat`
uses the managed root — and `--folder PATH` overrides it for a single command.
The path must stay inside `docs.managedPath`; `--folder ""` targets the root.
`workfile doc move` relocates a document without changing its ID or its content.

## History (changelog)

```bash
workfile changelog list [--unreleased] [--visibility public|internal] [--json]
workfile changelog show ID [--json]
workfile changelog add --title TITLE [--type fixed] [--area AREA]
workfile changelog patch ID --json-input FILE [--expected-revision REV]
workfile changelog preview [--fragments CHG-0001,CHG-0002]
workfile changelog release VERSION [--fragments CHG-0001,CHG-0002] [--title TITLE]
workfile changelog render [--visibility public|internal] [--write]
workfile changelog verify
```

Release version validation follows `changelog.releaseStrategy`: `semver`,
`calendar` or `freeform`.

## Memory

```bash
workfile memory list [--collection learnings] [--status active] [--json]
workfile memory show ID [--json]
workfile memory add COLLECTION --title TITLE [--status STATUS]
workfile memory patch ID --json-input FILE [--expected-revision REV]
workfile memory graduate ID --to CONV-0001,DOC-0001
workfile memory supersede ID --by ID
workfile memory verify
```

`add` accepts singular aliases (`learning`, `decision`, `incident`, `convention`,
`context`) as well as collection ids. Collections and prefixes:

| Collection | Prefix | Purpose |
| --- | --- | --- |
| learnings | `LRN` | Reusable observations with confidence and occurrences |
| decisions | `ADR` | Proposed / accepted / rejected / superseded decisions |
| incidents | `INC` | Operational events with severity and resolution metadata |
| conventions | `CONV` | Durable rules for humans and agents |
| context | `CTX` | Useful but potentially expiring project state |

## Agents

```bash
workfile agents sync [--targets agents-md,claude,cursor,copilot]
workfile agents check [--targets ...]
workfile agents context --card T-0001 [--limit 20]
```

`sync` writes compact managed blocks (version + SHA-256 digest) into `AGENTS.md`,
`CLAUDE.md`, `.cursor/rules/` or `.github/copilot-instructions.md` without touching
unrelated content. `context` returns a bounded, prioritized context bundle for a card.

## CI templates

```bash
project ci sync [--targets github,gitlab,generic]
project ci check [--targets ...]
```

## Legacy migration

```bash
project migrate plan [--source .planning] [--mode copy|move]
project migrate apply [--source .planning] [--mode copy|move] [--force]
project migrate schema [--dry-run] [--json]
```

Valid v1 cards become canonical v2 records; everything else is preserved under
`.project/sources/legacy-planning/` with a written migration report.

`migrate schema` is a different job: it moves a workspace forward when the
installed package expects a newer `schemaVersion` than `.project/VERSION`
declares. Steps run in ascending order under a lock, `--dry-run` prints the plan
without writing, and the result is recorded in `.project/migrations/schema.json`
along with `upgradedWith` in `.project/VERSION`. A workspace *newer* than the
package is refused with `WORKSPACE_SCHEMA_AHEAD` — upgrade the package instead.

## MCP

```bash
workfile mcp [serve] [--read-only]
workfile mcp inspect [--json]
workfile mcp config [--read-only] [--json]
```

See [mcp.md](mcp.md) for the server contract.
