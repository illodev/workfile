# MCP server

Workfile includes a local, dependency-free MCP server speaking UTF-8,
newline-delimited JSON-RPC over stdio. Every operation delegates to the same core
services used by the CLI and HTTP API.

```bash
workfile mcp                    # serve over stdio
workfile-mcp --root /path/to/repository
workfile mcp --read-only        # mutation tools removed from tools/list
workfile mcp inspect --json     # tool/resource/prompt inventory
workfile mcp config --json      # portable client process configuration
```

## Reading the workspace

`project_card_list`, `project_doc_list`, `project_changelog_list` and
`project_memory_list` answer "what is in here" without needing a search query.
They take filters (`status`, `area`, `type`, `priority`, `parent`, `claimedBy`,
`unclaimed`, `tags`, `updatedSince`) and return a compact row per record — no
Markdown body, no `revision`. `updatedSince` takes `YYYY-MM-DD`, or an RFC 3339
timestamp read as its date; anything else is refused with
`MCP_ARGUMENT_INVALID` rather than applied as a filter that matches nothing.

`project_next` answers the question an agent actually has: which cards can be
started now. It excludes epics and anything with unmet dependencies, puts work
already claimed by the caller first, and attaches the reason each candidate
qualified.

Listings deliberately omit `revision`. Writing needs a read-then-write —
`project_get_record` returns the current revision, which `expectedRevision`
then guards — and carrying a possibly-stale one in a list only invites a
conflict.

Every result carries the data once, in `structuredContent`; `content` is a
one-line summary rather than a second copy of the payload. When a result would
exceed `maxToolResultBytes` it is truncated with a `truncated` marker instead of
failing the call, because a get-by-id has no query to narrow.

## Claude Code integration

```bash
workfile claude install     # generate the surface into the repository
workfile claude check       # report drift, exit 1 when anything is stale
```

`install` writes, as managed blocks that a resync updates without touching
anything around them:

| File | What it does |
| --- | --- |
| `.mcp.json` | Registers the server, exactly as below |
| `.claude/commands/{next,claim,done,context}.md` | Slash commands over one CLI call each |
| `.claude/skills/workfile/SKILL.md` | Projects `.project/agents/protocol.md` rather than restating it |
| `.claude/settings.json` | Three hooks |

```json
{
  "mcpServers": {
    "workfile": {
      "command": "npx",
      "args": ["-y", "@illodev/workfile", "mcp"]
    }
  }
}
```

That is the form for a workspace with no local install. Where the package is a
dependency, `install` registers the copy in `node_modules` instead — the same
one the hooks already run — so the server and the hooks are the same build. The
two used to differ: `.mcp.json` fetched whatever npm published today while
`.claude/settings.json` ran whatever the repository had, and a workspace pinned
to 0.5.2 spoke to a 0.5.4 server. The two halves disagreeing about what the
protocol is produces symptoms that look like anything else. Re-running
`install` follows the dependency in either direction.

`upgrade` reports it when the binary doing the upgrading is not the one the
workspace will run — the shape `pnpm i -g @illodev/workfile` produces against a
repository that pins an older release.

It registers the package and the `mcp` subcommand, not the `workfile-mcp` bin.
That bin exists and parses its own flags — `workfile mcp config` emits it, for
hosts building a configuration themselves — but `npx` cannot select a named bin
from a package spec, so registering it that way started the CLI instead of the
server and every request was answered with the help text on stdout. T-0116
changed it in 0.4.0; this table went on describing the old behaviour until it
was corrected.

**`SessionStart`** injects the board once — cards in flight, who holds them,
which paths they cover — so a session begins informed without reading a record.
Once per session, not per prompt: per-prompt injection accumulates in the
window.

**`PreToolUse`** on `Edit|Write|NotebookEdit` compares the target path against
the scope of cards claimed by *other* actors and answers `ask` with the card and
the actor named. It also asks when something writes a `.project/` record
directly, because that skips the lock, the revision check and validation.

It asks; it never denies. A guard rail that blocks too much gets switched off,
and then it protects nothing.

**`PostToolUse`** refreshes the session heartbeat under
`.project/.cache/activity/sessions/` and appends one line to
`.project/.cache/activity/events.jsonl`, asynchronously. The heartbeat is what
makes a claim `live` rather than merely `held`: a hook is the only thing that
fires repeatedly for as long as an agent is working, and a one-shot CLI process
that signalled once would decay into a false `orphaned` ninety seconds later.

The hook runtime (`dist/src/runtime/claude/hooks.mjs`) imports nothing from this
package. `src/index.js` re-exports thirteen modules and several read
`package.json` at load, and `PreToolUse` runs before *every* tool call in the
session — not only the ones it might block. A test pins its p95.

Generated files grant permissions in someone else's repository, so
`allowed-tools` names the exact subcommand (`Bash(workfile card claim *)`), never
`Bash(project *)`. `.claude/settings.json` and `.mcp.json` are merged, not
replaced: a ledger in `.project/generated/claude-code.json` records which keys
are generated so removing one later actually removes it.

### Installing as a plugin

The same surface is distributed as a Claude Code plugin, for repositories that
would rather not have generated files committed:

```
/plugin marketplace add illodev/workfile
/plugin install workfile@illodev
```

The plugin registers the MCP server with `--root ${CLAUDE_PROJECT_DIR}` and
resolves its hooks through `${CLAUDE_PLUGIN_ROOT}`, so it works without the
package being a dependency of the repository at all.

The server is only half of it; the rest is session-side:

- **Slash commands** — `/claim` (claim a card with an honest scope),
  `/context` (the bounded context bundle for a card), `/next` (unclaimed
  candidates worth starting) and `/done` (verify, record, release).
- **A skill** that teaches the session the one non-negotiable rule: records
  under `.project/` change through the CLI or MCP tools, never through a raw
  file edit that would skip the lock, the revision check and validation.
- **Hooks** that make claims an executable guard rail rather than prose:
  `SessionStart` rebuilds the claims board and announces which cards are
  being worked on and by whom; `PreToolUse` asks — never denies — before an
  edit that lands inside another actor's claimed scope or touches a protocol
  record directly; an async `PostToolUse` refreshes the session heartbeat under
  `.project/.cache/activity/sessions/`, which is what the UI's presence
  indicators read, and appends the edit to `.project/.cache/activity/events.jsonl`.

Both forms exist on purpose. A plugin's `settings.json` accepts only `agent` and
`subagentStatusLine`, so anything else has to be generated locally; and a
generator alone means every version bump leaves the written files behind, which
is the trap `T-0018` recorded. `scripts/build-plugin.ts` assembles the plugin
from the same functions `workfile claude install` uses, and a test asserts the
packaged runtime is byte-identical to the source — a hook that behaves
differently depending on how it was installed is a bug nobody would find.

## Protocol revisions

The server is dual-era:

- **Modern `2026-07-28`** — stateless per-request `_meta`, `server/discover`,
  `resultType` and cache metadata.
- **Legacy `2025-11-25`** and earlier declared revisions — the
  `initialize` / `notifications/initialized` lifecycle for existing hosts.

## Tools (30)

Read-only:

| Tool | Purpose |
| --- | --- |
| `project_workspace` | Workspace, config and module overview |
| `project_search` | Unified weighted search across all collections |
| `project_get_record` | Any record by stable ID |
| `project_doctor` | Full health diagnostics |
| `project_agent_context` | Bounded, prioritized context for a card |
| `project_next` | Unclaimed, prioritized candidates to start now |
| `project_card_list` | Cards filtered by status, area, type or claim |
| `project_doc_list` | Documents with status and folder |
| `project_changelog_list` | Change fragments and cut releases |
| `project_memory_list` | Memory records per collection |

Mutations (absent in `--read-only` mode; rejected with `MCP_SERVER_READ_ONLY`):

| Domain | Tools |
| --- | --- |
| Work | `project_card_create`, `project_card_patch`, `project_card_write`, `project_card_note`, `project_card_claim`, `project_card_release`, `project_card_transition`, `project_card_archive`, `project_card_reopen` |
| Docs | `project_doc_create`, `project_doc_move`, `project_doc_patch` |
| History | `project_changelog_add`, `project_changelog_patch`, `project_changelog_preview`, `project_changelog_release` |
| Memory | `project_memory_add`, `project_memory_patch`, `project_memory_graduate`, `project_memory_supersede` |

Tool descriptions carry read-only, destructive and idempotency annotations.

### What each tool declares

Every tool declares its full contract, so a caller never has to infer one:

- **Every input property carries a `description`.** Names do not survive
  inference — `scope` is filesystem paths on a card and subject matter on a
  document, and `source` is provenance on both while meaning different things.
- **Closed vocabularies declare `enum`.** Card `status`, `type`, `priority` and
  `effort` come from frozen protocol constants, so they are enumerated in the
  schema itself. Areas, document kinds, changelog types and memory statuses are
  declared per project and accept any string, so they are *not* enumerated —
  their descriptions point at `project_workspace`, which reports what this
  project actually accepts.
- **Defaults are declared where the implementation has one**, rather than left
  for the caller to discover by omitting the field.
- **Every tool declares an `outputSchema`** matching the `structuredContent` it
  returns. None of them is a closed object: a payload over `maxToolResultBytes`
  gains a `truncated` marker, and a schema that forbade it would invalidate the
  server's own degradation path.

`project_card_release` is the one place where an enum is narrower than the
protocol's: a released card cannot stay `doing`, so that value is refused as an
explicit target and omitted from the schema.

`method` is the second. `project_card_transition`, `project_card_patch` and
`project_card_release` each take `method`, `run` and `evidence`, which say how a
close was proved — but the enum offers `local`, `ci` and `manual` only. `forced`
is derived from what the acceptance gate waived and is refused as an input, and
in any case no MCP tool can force a transition today: `project_card_transition`
declares neither `force` nor `reason` and reads neither, so a close through this
surface is always a proven one. Passing any of the three on a call that does not
move the card into `done` is refused rather than ignored.

That last point has a consequence worth stating, now that a project can declare
which methods an area accepts. `CARD_VERIFICATION_METHOD_REFUSED` is **final on
this surface**: the waiver every other surface offers is `force` with a reason,
and no MCP tool carries either. An agent that meets it has to prove the card the
way the project asks — read `project_workspace` first, under
`cards.verification.methods`, rather than discovering the rule by being refused.
Omitting `method` is not the way around it: a close with none records `local`.

`project_doctor` takes `checkGit` beside `checkPaths`. It gates the one check
that leaves the process — whether a done card's commit is still an ancestor of
HEAD — and nothing is spawned unless some card carries a commit.

## Resources and prompts

- **Resources:** `project://workspace`, `project://health`, `project://protocol`,
  `project://record/{id}`.
- **Prompts:** `start-work`, `finish-work`, `record-knowledge`.

## Limits

Two, both from `project.config.mjs`, and they guard opposite directions.

| Key | Default | What it does |
| --- | --- | --- |
| `mcp.maxMessageBytes` | 1 MiB | An incoming JSON-RPC line larger than this is refused with `-32600` before it is parsed. |
| `mcp.maxToolResultBytes` | 512 KiB | A result larger than this is truncated with a `truncated` marker rather than failing the call. |

Both accept 1 KiB to 16 MiB. The asymmetry between them is deliberate: an
oversized *request* is a client defect and failing it early is the honest
answer, while an oversized *result* is usually a get-by-id with no query to
narrow, so degrading beats refusing.

`mcp.resourcePageSize` (default 100, range 1–500) bounds how many records one
resource read returns.

## Process hygiene

stdout is reserved exclusively for MCP messages; diagnostics go to stderr.
`workfile mcp config` emits the Node executable, the **`workfile-mcp` binary**,
workspace root, preferred protocol revision and optional `--read-only` flag, so
hosts can build their own client configuration — client-specific files stay
outside the canonical repository protocol.

It names the dedicated binary rather than `workfile mcp` on purpose: the
multiplexed CLI takes the third argument as a subcommand, so a `--root` in that
position is not a flag it can parse. `test/mcp.test.ts` spawns exactly what the
helper returns and drives a handshake through it, so the emitted command cannot
drift into being unrunnable again.
