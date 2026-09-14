---
title: Workfile vs Backlog.md — Markdown task tracking for AI agents, compared
label: vs Backlog.md
description: Both keep tasks as Markdown in git, with a CLI, a board and an MCP server. Backlog.md ships a compiled binary and a terminal board; Workfile enforces claims and a done gate.
checked: 2026-09-14
---

# Workfile vs Backlog.md

Backlog.md is the closest thing to Workfile there is: tasks as Markdown files with frontmatter, git as the database, a CLI, a web board and an MCP server. The difference is what happens when an agent does not follow the rules. In Backlog.md an assignee is a field and acceptance criteria are guidance; in Workfile a claim refuses another actor's transition, and `done` is refused while a criterion is unchecked. Backlog.md is far more widely used, ships as a compiled binary, and has a terminal board Workfile does not.

Read against Backlog.md [1.52.0](https://registry.npmjs.org/backlog.md) at commit [`39912b8`](https://github.com/MrLesk/Backlog.md/tree/39912b864053dcdd1fafc458aacde43ffd616a0c) and `@illodev/workfile` 0.13.2.

## Side by side

| | Workfile 0.13.2 | Backlog.md 1.52.0 |
| --- | --- | --- |
| Records | Markdown with frontmatter in `.project/`: cards, docs, changelog fragments and releases, memory | Markdown with frontmatter in `backlog/`: tasks, drafts, documents, decisions, milestones ([source](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/src/constants/index.ts#L4-L29)) |
| Who holds a task | A claim over paths; a transition or release by another actor is refused with `CARD_CLAIM_OWNER_MISMATCH` | `assignee` is a list used for filtering ([type](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/src/types/index.ts#L50)); per-task write locks stop two writes colliding but record no owner ([locks](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/src/file-system/operations.ts#L637-L711)) |
| Done with criteria unchecked | Refused with `CARD_ACCEPTANCE_UNMET`; forcing it requires a reason, which the card keeps | Allowed. `task_edit` sets the status without reading the checklists ([source](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/src/core/backlog.ts#L2014-L2020)); `task_complete` checks the status and branch, not the criteria ([handler](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/src/mcp/tools/tasks/handlers.ts#L493-L520)); checking criteria first is guidance to the agent ([guideline](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/src/guidelines/mcp/task-finalization.md#L21-L22)) |
| Changelog | Fragments linked to cards, cut into releases, rendered to `CHANGELOG.md` | None as a feature ([their own draft](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/backlog/drafts/draft-13%20-%20Create-CHANGELOG.md)) |
| Memory | Decisions, learnings, incidents, conventions and expiring context, each a typed record | Decisions as records; no learnings, incidents or conventions |
| MCP server | `workfile mcp`, stdio, <!-- generated:tool-count -->32<!-- /generated:tool-count --> tools, `--read-only` | `backlog mcp start`, stdio, 20 tools ([registration](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/src/mcp/server.ts#L545-L550)) |
| Validation | `workfile doctor` | `backlog doctor`, with `--fix` for duplicate task IDs ([source](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/src/cli.ts#L5490-L5635)) |
| Board | Local web UI | Local web board and a terminal board ([terminal](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/src/cli.ts#L4454-L4587), [web](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/src/cli.ts#L5779-L5781)) |
| Network by default | One npm version check a day, removed by `upgrade: { check: false }` | No telemetry; `git fetch origin`, when a remote exists and `remoteOperations` is on (the default), before allocating an ID and at most once a minute while reading tasks across branches ([default](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/src/constants/index.ts#L69), [fetch](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/src/git/operations.ts#L572-L615), [reads](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/src/core/backlog.ts#L711-L766)) |
| Runtime | Node.js ≥ 22 | A compiled binary per platform through Homebrew, npm or Bun (a small Node launcher picks it); the Nix flake runs a bundled build on Bun ([README](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/README.md#L78-L83), [build](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/scripts/build.ts#L20-L36), [flake](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/flake.nix#L89-L91)) |
| License | MIT | MIT ([LICENSE](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/LICENSE)) |

## Where Backlog.md is stronger

- **Adoption.** 6,726 GitHub stars and 12,847 npm downloads in the week to 2026-09-11 ([GitHub](https://api.github.com/repos/MrLesk/Backlog.md), [npm](https://api.npmjs.org/downloads/point/last-week/backlog.md)), with 17 npm releases between May and September 2026. Workfile is a young project with a fraction of that.
- **No Node.js required.** Homebrew installs a compiled binary, and the npm and Bun packages wrap the same binary; Workfile needs Node.js 22.
- **A terminal board.** `backlog board`. Workfile's board is a web UI only.
- **Cross-branch awareness.** It shows task state from recently active branches, and checks IDs on other branches and worktrees before allocating one. Workfile reads records only from the checkout it runs in.
- **A versioned JSON contract** with `schemaVersion`, and `--watch` streaming for `task list --json` ([spec](https://github.com/MrLesk/Backlog.md/blob/39912b864053dcdd1fafc458aacde43ffd616a0c/CLI-INSTRUCTIONS.md#L95-L136)).
- **Shell completions** for bash, zsh, fish and PowerShell 7.
- **A smaller agent surface.** 20 MCP tools against Workfile's <!-- generated:tool-count -->32<!-- /generated:tool-count -->.

## Where Workfile is stronger

- **Claims that refuse.** A second agent cannot move or release a card the first one holds, and in Claude Code the plugin's hook asks before an edit inside a claimed scope.
- **A done gate.** Criteria under `## Acceptance criteria` must be checked before `done`, and a forced close keeps its reason on the card.
- **History.** Changelog fragments linked to cards, cut into releases.
- **Typed memory.** `workfile agents context --card ID` hands an agent the card and every accepted decision and convention in force.
- **An HTTP API and a read-only MCP mode** over the same core.

## Which to choose

- **Backlog.md** if one person or one agent drives the work, you want a binary with no runtime, or you live in the terminal.
- **Workfile** if several agents share a checkout, "done" has to mean proven, or the decisions and changelog belong beside the tasks.
