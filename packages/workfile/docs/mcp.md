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
| `.mcp.json` | Registers `workfile-mcp` — the binary that parses its own flags |
| `.claude/commands/{next,claim,done,context}.md` | Slash commands over one CLI call each |
| `.claude/skills/workfile/SKILL.md` | Projects `.project/agents/protocol.md` rather than restating it |
| `.claude/settings.json` | Three hooks |

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

## Resources and prompts

- **Resources:** `project://workspace`, `project://health`, `project://protocol`,
  `project://record/{id}`.
- **Prompts:** `start-work`, `finish-work`, `record-knowledge`.

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
