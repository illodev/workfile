# CLI reference

Every command accepts the global options and returns stable machine-readable
errors with `--json`.

The package installs the CLI under two names: `workfile` and the short alias
`wf`. They are the same entry point, and the help and error hints answer in
whichever one you typed. This reference spells the long form throughout.

Prefer the long form in anything generated, scripted or shared — CI, a
`package.json` script, a README a stranger will copy. `wf` only resolves for a
binary that is already installed, while an unrelated `wf` package exists on the
registry, so `npx wf` would fetch that instead of failing. Workfile's own
generated protocols and skills always spell it long for that reason.

## Global options

This is the whole list. Every other option belongs to the subcommands that
read it, and appears in their usage lines below.

| Option | Meaning |
| --- | --- |
| `--root PATH` | Workspace root (default: discovered from the working directory) |
| `--json` | Machine-readable output |
| `--dry-run` | Preview filesystem changes, where the subcommand implements it |
| `--allow-new` | Accept a directory that is not yet a workspace |
| `--verbose` | Print the resolved workspace root to stderr before running |
| `--help`, `-h` | Print the usage for a command without running it |

An option a subcommand does not accept is refused with `CLI_ARGUMENT_UNKNOWN`,
and one given twice with `CLI_ARGUMENT_CONFLICT`, because only the first is
read. Pass a list as one comma-separated value.

A word that branches answers for its own subcommand first: an unrecognised one
with `CLI_COMMAND_UNKNOWN` and a missing one with `CLI_COMMAND_REQUIRED`, both
listing what the word does accept. `workfile claude`, `workfile mcp` and
`workfile migrate` are the exceptions — they run `check`, `serve` and `apply`
respectively, and are checked as though you had typed those.

`--dry-run` is global but not universal. It is accepted everywhere so that no
caller has to remember where it works, and then refused with
`CLI_FLAG_UNSUPPORTED` on any command that would have written anyway — naming
the read-only command to look with instead, such as `changelog preview` or
`card show`. Silently making the change would be the alternative.

These four read as global for a while and are not. They are listed here because
the wrong version of this table shipped, and a reader who learned it from that
one needs to find the correction where the mistake was.

| Option | Subcommands that accept it |
| --- | --- |
| `--expected-revision REV` — reject the write when the file changed since it was read | `card ac`, `card archive`, `card claim`, `card note`, `card patch`, `card release`, `card reopen`, `card transition`, `card write`, `changelog patch`, `changelog release`, `doc move`, `doc patch`, `memory graduate`, `memory patch`, `memory supersede` |
| `--force` — proceed past the check the command would otherwise fail | `agents sync`, `card claim`, `card patch`, `card release`, `card transition`, `ci sync`, `claude install`, `claude sync`, `init`, `migrate apply` |
| `--read-only` — disable the MCP mutation tools | `mcp config`, `mcp inspect`, `mcp serve`, `mcp stdio` |
| `--yes` — accept the initializer defaults without prompting | `init` |

Exit codes: `3` stale revision · `2` configuration error · `1` validation / not found.

## Accepted spellings

The dispatcher answers to more words than this reference spells. Each pair below
reaches the same code — there is no behavioural difference, and neither spelling
is deprecated. The left column is what the rest of this document uses.

| Documented | Also accepted |
| --- | --- |
| `workfile doc …` | `workfile docs …` |
| `workfile changelog …` | `workfile history …` |
| `workfile ui` | `workfile serve` |
| `workfile agents check` | `workfile agents status` |
| `workfile ci check` | `workfile ci status` |
| `workfile changelog add` | `workfile changelog create` |
| `workfile memory add` | `workfile memory create` |
| `workfile claude install` | `workfile claude sync` |
| `workfile mcp serve` | `workfile mcp stdio` |

They are listed because an alias nobody documents is one nobody can rely on: it
resolves today, it is not in `--help`, and the only way to learn it is to read
the dispatcher. A test requires every subcommand the binary accepts to be named
somewhere in this file, so a new spelling that skips this table fails the suite
rather than arriving undocumented.

## Workspace

```bash
workfile init [--root PATH] [--yes] [--dry-run] [--name NAME]
workfile version                # the installed package version, one line
workfile schema [--json]        # effective runtime schema (areas, vocabularies…)
workfile doctor [--json] [--severity error|warning] [--max-issues N] [--rebuild-cache] [--fix]
workfile doctor --new              # only what appeared since the baseline
workfile doctor --accept-baseline  # record the current state as known
workfile upgrade [--dry-run] [--json]
workfile ui [--host HOST] [--port PORT] [--verbose]
workfile next [--actor ACTOR] [--area AREA,AREA] [--limit N] [--json]
workfile search QUERY [--kind card,doc,change,release,memory] [--limit N] [--mode auto|lexical|hybrid] [--json]
```

`ui` serves the board on `ui.port` from `project.config.mjs`, which is `4747`
until a workspace says otherwise. Two projects therefore ask for the same port,
so a taken default moves aside: the board comes up on the next free port and
says which project holds the one it wanted. A port you named yourself does not
move — an explicit `--port` that is in use fails with `UI_PORT_IN_USE` rather
than landing somewhere you did not ask for. Set `ui.port` per project to keep
each board at an address you can remember.

`next` answers what to pick up now: work you already claimed first, then
unblocked cards by priority, with unmet dependencies excluded rather than ranked
low. Every row carries the reason it was offered. It is the same ranking the
`project_next` MCP tool serves.

`doctor` reports absolute state, which stops being useful the moment a
repository carries inherited debt: a clean run and an unchanged dirty one look
alike, so nobody can require it. `--accept-baseline` writes the current issue set
to `.project/doctor-baseline.json`, and `--new` then reports only what appeared
afterwards, exiting `1` on anything new and `0` otherwise.

That file is committed on purpose. A baseline under the cache would be
per-clone and missing in CI, which is the one place a "nothing new" verdict has
to hold, and keeping it in the tree puts newly accepted debt in the diff where a
reviewer can see it. Issues are matched on rule, subject and message, so two
different problems from the same rule against the same card stay distinct.
`--new` answers "did I make this worse"; plain `doctor` is still where you go to
ask whether anything is wrong at all.

`search` is lexical by default and becomes hybrid automatically when
`project.config.mjs` declares an integration with a semantic search provider
(`export const integrations = [...]`; `search.provider` selects one by id when
several are declared). `--mode lexical` opts out for a run; `--mode hybrid`
fails with `SEARCH_PROVIDER_UNAVAILABLE` instead of silently degrading when no
provider is available. `--json` reports which mode actually ran. Workfile never
sends repository content to a network service by itself — a provider only runs
if the repository explicitly declares it.

The first-party provider is
[`@illodev/workfile-search-local`](https://github.com/illodev/workfile/tree/main/packages/search-local#readme):
on-device embeddings via transformers.js, cached by content hash, fully
offline after the first model download.

`upgrade` is the one command to run after bumping `@illodev/workfile`: it
compares the installed version against the stamp on every managed surface the
config owns (agent adapters, CI templates, the Claude Code surface) and
resyncs the ones behind — including surfaces whose *content* is current but
whose stamp is old, which the staleness checks deliberately ignore. Managed
blocks whose kind no configured target owns are reported instead of silently
fossilizing.

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
| `/timeout \d+/i` | regular expression over id, title and body; flags from `imsu` |

Field names are the record's own keys, so the vocabulary follows the runtime
schema rather than a second list. An unknown field matches nothing instead of
falling back to free text, which would quietly return everything.

Text is compared with diacritics folded, so `diseno` finds `Diseño`.

Only the full `/pattern/flags` form runs as a regex — a slash inside a plain
query does not. Regex queries are exact-intent: they bypass the semantic
provider, rank title hits above body hits and match count after that, and
report `mode: "regex"`. Patterns are capped at 256 characters, bodies scanned
to their first 20,000; an invalid pattern fails with `SEARCH_REGEX_INVALID`.

## Work (cards)

```bash
workfile card list [--status S] [--area A] [--type T] [--priority P] [--parent ID]
                  [--claimed-by ACTOR] [--unclaimed] [--tag TAG] [--updated-since DATE]
                  [--axis NAME=VALUE] [--limit N] [--offset N] [--fields a,b]
                  [--with-body] [--json]
workfile card show ID [--json]
workfile card create --title TITLE [--area AREA] [--type TYPE] [--priority PRIORITY]
                    [--parent ID] [--source PATH] [--tags a,b] [--scope PATH,PATH]
                    [--depends ID,ID] [--related ID,ID] [--origin ID,ID]
                    [--milestone M] [--effort S|M|L]
                    [--start DATE] [--due DATE] [--body TEXT] [--axis NAME=VALUE]
workfile card create --json-input FILE
workfile card patch ID --json-input FILE [--expected-revision REV]
workfile card patch ID --axis NAME=VALUE          # repeatable; empty value clears it
workfile card claim ID [--scope PATH,PATH] [--actor ACTOR] [--force --reason TEXT]
workfile card release ID [--actor ACTOR] [--status next]
workfile card transition ID STATUS [--actor ACTOR]
workfile card archive ID
workfile card reopen ID [--status backlog] [--actor ACTOR]
workfile card reap [--dry-run] [--older-than HOURS] [--json]
workfile card renumber ID|FILE [--to T-0123] [--actor ACTOR]
workfile card renumber --duplicates [--actor ACTOR]
workfile card ac ID                              # list criteria with their numbers
workfile card ac ID --check 1,3 --check 5        # repeatable, comma lists accepted
workfile card ac ID --uncheck 2
```

Acceptance criteria are the `- [ ]` items under a `## Acceptance criteria` heading.
The storage does not change — it renders on GitHub and `grep` finds it. What `ac` adds
is that they are addressable. Numbers are positional, and every write carries the usual
lock and revision check, so a concurrent reorder is refused rather than quietly applied
to the wrong line.

`card transition ID done` refuses while any criterion is unproven and names the ones
that are, because `done` means verified where the code actually runs. `--force` gets
through for the cases the criteria did not anticipate.

`card create --json-input FILE` is the form to reach for when the card has a
body. It takes the whole record — title, body, parent, source, tags, scope — in
one call, and a JSON file survives backticks, `$` and accents that a shell
heredoc quietly mangles. The flag form above writes the same fields; it is the
body that argues for the file.

`--origin ID,ID` records which records the work came out of — the card being
worked when it was found, the decision that produced it. Any record kind, not
cards only. It is provenance, not decomposition: use `--parent` when the card is
genuinely part of another, and `--origin` when it merely came out of it. There
is no `card patch --origin`; patching any card field goes through
`--json-input`, the same as every other field. `agents context --card ID` reads
it back in both directions, and `doctor` reports an origin that resolves to
nothing.

`--axis NAME=VALUE` writes a classification axis the project declares under
`cards.axes` — a second axis alongside `area`, for domains rather than delivery
layers. Run `workfile schema --json` to see which axes exist and what each
accepts; an undeclared axis and a value outside its vocabulary are both refused,
and the message carries the list. It repeats, once per axis, because the axis
name is per project and a flag per axis is not something a static table can
offer. `--axis context=` with nothing after the `=` clears it.

`card list --axis context=treasury` filters on the same axis, and combines with
every other filter. A comma list is an OR within one axis
(`--axis context=treasury,billing`); a second `--axis` for a different name is
an AND. Repeating the *same* name is refused with `CLI_ARGUMENT_CONFLICT`,
because only one value would survive and the caller could not tell which.

`doctor` reports on declared axes the way it reports on areas: a value outside
the vocabulary is an **error**, since it is a typo that silently matches
nothing, and an open card with no value at all is a **warning**. Cards that are
`done`, `discarded` or archived are exempt from the warning — declaring an axis
on an existing repository must not emit one line per finished card, which is a
flood nobody acts on rather than a signal.

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

Options are validated per **subcommand**, not per command word. `card show
--status doing` and `card patch ID --json-input p.json --title "..."` are
refused with `CLI_ARGUMENT_UNKNOWN`, and the message names the subcommand the
flag does belong to. They used to exit 0 having silently dropped the flag, which
an agent cannot detect.

An option given twice is refused with `CLI_ARGUMENT_CONFLICT`, because only the
first occurrence is read — pass a list as one comma-separated value. `card ac
--check`, `--uncheck` and `card create|patch --axis` are the exceptions and may
repeat, because something reads every occurrence.

Only `--root`, `--json`, `--dry-run` and `--allow-new` are global.

A value a filter cannot parse is refused with `CLI_OPTION_INVALID`, never
applied as a filter that matches nothing. `--updated-since` takes `YYYY-MM-DD`
(an RFC 3339 timestamp is accepted and read as its date); `--limit`, `--offset`,
`--max-issues`, `--older-than`, `--occurrences` and `--port` take whole numbers.
`--updated-since 2026-7-1` used to exit 0 with `"total": 0`, and `--limit abc`
to return an empty page under a non-zero `total`.

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
workfile agents whoami [--json]
```

`sync` writes compact managed blocks (version + SHA-256 digest) into `AGENTS.md`,
`CLAUDE.md`, `.cursor/rules/` or `.github/copilot-instructions.md` without touching
unrelated content. `context` returns a bounded, prioritized context bundle for a card.

`whoami` prints the actor every surface attributes mutations to, and which rung
produced it. Resolution order: an explicit `--actor`, then `$WORKFILE_ACTOR`, then
`user@host` — discriminated by a short session prefix when a session id is present,
because two agent sessions in one checkout are two actors and a shared username
would let them silently take each other's claims. Set `$WORKFILE_ACTOR` to pin a
stable name.

## Claude Code

```bash
workfile claude install [--dry-run] [--force]
workfile claude check [--json]
```

`install` writes the Claude Code surface into the repository — the MCP server
registration, the slash commands, the skill and the session hooks — as managed
blocks a later resync updates without touching anything around them. `check`
reports which of them are stale and exits `1` when any is, which is what makes
it usable in CI. Each stale file is reported with the comparison that failed —
`style`, `body`, `digest` or `trailing-newline` — because one of them is
otherwise invisible: the digest is taken over trimmed bytes, so a file that
lost its final newline agrees with its own digest and is stale over a byte no
hash covers.

`workfile claude` with no subcommand runs `check`, because reporting is the
safe default for a word that otherwise writes files.

Neither command is what installs the *package* into a Claude Code session:
a client reads `.mcp.json` and starts the server itself. See
[mcp.md](mcp.md) for what `install` writes and what each hook does.

## CI templates

```bash
workfile ci sync [--targets github,gitlab,generic]
workfile ci check [--targets ...]
```

## Legacy migration

```bash
workfile migrate plan [--source .planning] [--mode copy|move]
workfile migrate apply [--source .planning] [--mode copy|move] [--force]
workfile migrate schema [--dry-run] [--json]
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
