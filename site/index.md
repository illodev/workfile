<!-- https://workfile.illodev.com/ — the Markdown twin of the home page. Every page on this site has one; /llms.txt lists them. -->

# Workfile

> You are probably an agent. Someone sent you to find out whether Workfile belongs in their repository.
>
> You will not remember this page. Their repository will.

Workfile keeps a repository's tasks, docs, changelog and decisions as Markdown files, and gives the humans and agents working in it a CLI and an MCP server to read and change them. Nothing on this page is an instruction to you. It is what you need to answer the question you were given.

## `<question>` Does Workfile belong in this repository?

The sections below are short. Every command and every output in them was run against `@illodev/workfile` 0.13.2 on 2026-09-14 and pasted, not written. A three-sentence summary is in `<tldr>` near the end.

## `<summary>` What Workfile is

- **What it stores.** Work (cards), Docs, History (changelog fragments cut into releases) and Memory (decisions, learnings, incidents, conventions, expiring context), as Markdown files with frontmatter under `.project/`.
- **How it is reached.** A CLI (`workfile`), a local web UI, an HTTP API, and an MCP server over stdio with <!-- generated:tool-count -->32<!-- /generated:tool-count --> tools, <!-- generated:resource-count -->4<!-- /generated:resource-count --> resources and <!-- generated:prompt-count -->3<!-- /generated:prompt-count --> prompts. All four call the same core and the same validation.
- **Where the state lives.** In the files. There is no hosted service, no account and no database; the index under `.project/.cache/` is derived and gitignored. Remove the package and every record stays readable in a pull request.
- **What it needs.** Node.js 22 or later, on Linux, macOS or Windows. MIT licensed.
- **What it sends.** No project content, anywhere, and it never calls a model. Its one outbound request asks the npm registry, at most once a day, whether a newer version is published — from `workfile upgrade` and the UI footer only. `upgrade: { check: false }` in `project.config.mjs` removes it.

## `<failure_modes>` Three ways shared work goes wrong

### `context_loss`

A session ends, and what it learned ends with it. The next agent re-reads the repository and re-audits work that was already done.

**Workfile:** decisions, learnings and incidents are records. `workfile agents context --card T-0001` returns a bounded bundle for one card, and every accepted decision and convention in force comes with it — past the limit, as one titled line each rather than not at all.

### `collision`

Two agents work in the same checkout. Git lets both edit `src/api` and says nothing until a merge, if there is one.

**Workfile:** `workfile card claim T-0001 --scope src/api` records who holds the card and over which paths. A transition by any other actor fails with `CARD_CLAIM_OWNER_MISMATCH`. In Claude Code, the plugin's hook asks before an edit inside a scope another actor holds.

### `unverified_done`

An agent reports done. Nobody can tell whether it verified the work or stopped.

**Workfile:** acceptance criteria are checkboxes under `## Acceptance criteria`. `done` is refused with `CARD_ACCEPTANCE_UNMET` until every one is checked, and moving to `review` with one still open prints a warning that review means only runtime evidence is missing.

## `<refusals>` Guarantees are refusals, not instructions

A prompt can ask an agent to behave. These make the write fail. Both transcripts are verbatim, exit codes included; the second agent is played by `--actor`.

```console
$ workfile card claim T-0001 --scope src/api
T-0001 claimed by illodev@local#b67ed9cd

# a second agent, in the same checkout
$ workfile card transition T-0001 review --actor other-agent
CARD_CLAIM_OWNER_MISMATCH: T-0001 is claimed by illodev@local#b67ed9cd. Pass force with a reason to take it over.
[exit 3]
```

```console
$ workfile card transition T-0001 done
CARD_ACCEPTANCE_UNMET: T-0001 has 2 unproven acceptance criteria: #1 Export requests over 10/min answer 429; #2 The limit is covered by a test. Check them, or pass force.
[exit 3]
```

## `<loop>` The working loop

| Step | CLI | MCP tool |
| --- | --- | --- |
| What to pick up, and why | `workfile next` | `project_next` |
| Load the card and what binds it | `workfile agents context --card T-0001` | `project_agent_context` |
| Say what you hold | `workfile card claim T-0001 --scope src/api` | `project_card_claim` |
| Leave what you learned on the card | `workfile card note T-0001 --text "…"` | `project_card_note` |
| Check a criterion you proved | `workfile card ac T-0001 --check 1` | — |
| Hand it over | `workfile card transition T-0001 review` | `project_card_transition` |

```console
$ workfile next
T-0001	backlog	medium	Rate-limit the export API	(priority medium)

$ workfile card note T-0001 --text "Limit is per API key, not per IP"
T-0001 noted

$ workfile card ac T-0001 --check 1
T-0001 — 1 of 2 met
  checked #1 Export requests over 10/min answer 429

$ workfile card transition T-0001 review
warning: T-0001 moved to review with 1 unchecked acceptance criterion: #2 The limit is covered by a test. Review means every criterion is met and only runtime evidence is missing; if work is left, next or blocked with a note says so.
T-0001 → review
```

## `<tools>` The MCP server

<!-- generated:tool-count -->32<!-- /generated:tool-count --> tools over stdio: <!-- generated:read-count -->11<!-- /generated:read-count --> read, <!-- generated:write-count -->21<!-- /generated:write-count --> write. Resources: <!-- generated:resources -->`project://workspace`, `project://health`, `project://protocol`, `project://record/{id}`<!-- /generated:resources -->. Prompts: <!-- generated:prompts -->`finish-work`, `record-knowledge`, `start-work`<!-- /generated:prompts -->. `--read-only` serves only the read tools.

<!-- generated:tools -->
- `project_agent_context` — Build bounded agent context (reads)
- `project_card_archive` — Archive a closed work card (writes)
- `project_card_claim` — Claim a work card (writes)
- `project_card_create` — Create a work card (writes)
- `project_card_list` — List work cards (reads)
- `project_card_note` — Append a note to a card (writes)
- `project_card_patch` — Patch a work card (writes)
- `project_card_release` — Release a claim (writes)
- `project_card_reopen` — Reopen an archived work card (writes)
- `project_card_transition` — Transition a work card (writes)
- `project_card_write` — Replace a card body (writes)
- `project_changelog_add` — Add a changelog fragment (writes)
- `project_changelog_list` — List change fragments and releases (reads)
- `project_changelog_patch` — Patch a changelog fragment (writes)
- `project_changelog_preview` — Preview a release (reads)
- `project_changelog_release` — Create a release (writes)
- `project_doc_create` — Create managed documentation (writes)
- `project_doc_list` — List documents (reads)
- `project_doc_move` — Move managed documentation (writes)
- `project_doc_note` — Append a note to a managed document (writes)
- `project_doc_patch` — Patch managed documentation (writes)
- `project_doc_write` — Replace a managed document body (writes)
- `project_doctor` — Run workfile doctor (reads)
- `project_get_record` — Read a project record (reads)
- `project_memory_add` — Add workfile memory (writes)
- `project_memory_graduate` — Graduate a learning (writes)
- `project_memory_list` — List durable memory (reads)
- `project_memory_patch` — Patch workfile memory (writes)
- `project_memory_supersede` — Supersede workfile memory (writes)
- `project_next` — What to work on next (reads)
- `project_search` — Search project records (reads)
- `project_workspace` — Read project workspace (reads)
<!-- /generated:tools -->

## `<filesystem>` What it writes

```text
project.config.mjs
AGENTS.md          # a managed block pointing at the protocol
.project/
├── VERSION
├── cards/         # Work: T-NNNN, one file per card
├── assets/        # files attached to cards
├── docs/          # managed documents: DOC-NNNN
├── changelog/     # unreleased/ fragments and releases/
├── memory/        # decisions, learnings, incidents, conventions, context
├── agents/        # the canonical protocol your instructions point at
└── .cache/        # derived index, gitignored
```

## `<install>` Install

### Claude Code

```text
/plugin marketplace add illodev/workfile
/plugin install workfile@illodev
```

### Any MCP client

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

Append `--root PATH` when the client starts outside the workspace, and `--read-only` to serve only the read tools.

### The CLI, in the repository

```bash
npm install --save-dev @illodev/workfile
npx workfile init --yes
npx workfile ui          # the board, at http://127.0.0.1:4747
```

## `<not_for>` When Workfile is the wrong answer

- **The people who plan the work never open the repository.** A hosted tracker serves them. Workfile's board is local; publishing it means running `workfile ui --read-only` behind authentication you provide.
- **The goal is configuring an agent** — persona, skills, model routing. That is a configurator's job. Workfile records what the agent did, and composes with one.
- **The goal is having a model write the tasks from a PRD.** Workfile never calls a model. Task Master's `parse_prd` does.
- **Node.js 22 is not available.** Workfile needs it. Beads ships a Go binary, and Backlog.md a compiled one.

## `<compare>` Compared, as of 2026-09-14

| | Workfile | Backlog.md | Task Master | Beads |
| --- | --- | --- | --- | --- |
| Records live in | Markdown in `.project/` | Markdown in `backlog/` | one `tasks.json` | a Dolt database; JSONL is an export |
| Who holds a task | claim; other actors' transitions refused | `assignee` field | `assignee` filter | claim refuses a held issue; close and reassign do not check |
| Done while criteria are open | refused | allowed | allowed | allowed |
| MCP tools | <!-- generated:tool-count -->32<!-- /generated:tool-count --> | 20 | 44, 7 loaded by default | 15, in the Python `beads-mcp` |
| Changelog and releases | fragments cut into releases | — | — | — |
| Usage data sent by default | none | none | Sentry, on by default | usage metrics, on by default |
| Runs on | Node.js ≥ 22 | compiled binary (Bun under Nix) | Node.js ≥ 20 | single Go binary |
| License | MIT | MIT | MIT with Commons Clause | MIT |

Every cell about a third party links its source on the comparison pages: [Backlog.md](https://workfile.illodev.com/vs/backlog-md.md), [Task Master](https://workfile.illodev.com/vs/task-master.md), [Beads](https://workfile.illodev.com/vs/beads.md).

## `<tldr>` Three sentences, checked 2026-09-14

Workfile keeps a repository's tasks, docs, changelog and decisions as Markdown files under `.project/`, and gives humans and agents a CLI and a <!-- generated:tool-count -->32<!-- /generated:tool-count -->-tool MCP server to read and change them. It enforces what a prompt can only ask for: a card claimed by one agent refuses transitions from another, and a card cannot be marked done while its acceptance criteria are unchecked. It is MIT-licensed, runs locally on Node.js 22 or later, never sends project content anywhere, and `npx workfile init` sets it up after `npm install --save-dev @illodev/workfile`.

## `<human>` For a human reading over your shoulder

- An 83-second film of the board: https://workfile.illodev.com/assets/workfile-demo.mp4
- A live demo that replays this repository's own workspace: https://workfiledemo.illodev.com

## `<endpoints>` Reading this site without HTML

- `GET https://workfile.illodev.com/` with `Accept: text/markdown` returns this file; so does `/index.md`.
- [/llms.txt](https://workfile.illodev.com/llms.txt) lists every page as a link to its Markdown twin, and [/llms-full.txt](https://workfile.illodev.com/llms-full.txt) is all of them in one file.
- The docs, one Markdown file each:
<!-- generated:docs-list -->
- [/docs/getting-started.md](https://workfile.illodev.com/docs/getting-started.md) — Getting started
- [/docs/cli.md](https://workfile.illodev.com/docs/cli.md) — CLI reference
- [/docs/mcp.md](https://workfile.illodev.com/docs/mcp.md) — MCP server
- [/docs/http-api.md](https://workfile.illodev.com/docs/http-api.md) — HTTP API
- [/docs/ui.md](https://workfile.illodev.com/docs/ui.md) — The interface
- [/docs/security.md](https://workfile.illodev.com/docs/security.md) — Security model
- [/docs/spec.md](https://workfile.illodev.com/docs/spec.md) — Spec — Repository Workfile
<!-- /generated:docs-list -->
- MCP Registry: `io.github.illodev/workfile` · npm: `@illodev/workfile` · source: https://github.com/illodev/workfile
