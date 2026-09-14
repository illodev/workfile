---
title: Workfile vs Task Master — task tracking for AI coding agents, compared
label: vs Task Master
description: Task Master turns a PRD into tasks with a model and ships 44 MCP tools. Workfile never calls a model, keeps Markdown in the repository and refuses done with open criteria.
checked: 2026-09-14
---

# Workfile vs Task Master

Task Master (`task-master-ai`) and Workfile answer different questions. Task Master plans: it hands a PRD to a model, gets back a tree of tasks, then expands, scopes and researches them. Workfile records: it keeps the tasks, decisions and changelog that people and agents produce as Markdown in the repository, and refuses the writes that would make them untrue. Task Master has many times the users. It also keeps every task in one JSON file, lets an agent mark a task done without checks, and turns on Sentry reporting unless `anonymousTelemetry` is set to `false`.

Read against Task Master [0.43.1](https://registry.npmjs.org/task-master-ai) — its latest release, from 2026-03-31 — at commit [`1c7365c`](https://github.com/eyaltoledano/claude-task-master/tree/1c7365cab1f1d8ee5b0ecc2292a9ba9cf5efea2e), and `@illodev/workfile` 0.13.2. The telemetry was also read in the published npm tarball, not only in the source.

## Side by side

| | Workfile 0.13.2 | Task Master 0.43.1 |
| --- | --- | --- |
| Records | One Markdown file per record in `.project/` | One `.taskmaster/tasks/tasks.json`; `parse-prd` and the tag commands keep each tag as a top-level key ([parse-prd](https://github.com/eyaltoledano/claude-task-master/blob/1c7365cab1f1d8ee5b0ecc2292a9ba9cf5efea2e/scripts/modules/task-manager/parse-prd/parse-prd-helpers.js#L229-L257)); `task_NNN.md` files are generated from it ([generator](https://github.com/eyaltoledano/claude-task-master/blob/1c7365cab1f1d8ee5b0ecc2292a9ba9cf5efea2e/packages/tm-core/src/modules/tasks/services/task-file-generator.service.ts#L130-L138)) |
| Hosted storage | None | Optional Hamster storage, used automatically in the default `auto` mode when API credentials are configured or when logged in with a brief selected ([factory](https://github.com/eyaltoledano/claude-task-master/blob/1c7365cab1f1d8ee5b0ecc2292a9ba9cf5efea2e/packages/tm-core/src/modules/storage/services/storage-factory.ts#L109-L153)) |
| Record types | Cards with parents and dependencies, docs, changelog, memory | Tasks, one level of subtasks, dependencies, tags, complexity reports ([types](https://github.com/eyaltoledano/claude-task-master/blob/1c7365cab1f1d8ee5b0ecc2292a9ba9cf5efea2e/packages/tm-core/src/common/types/index.ts#L131-L176)) |
| Who holds a task | A claim over paths; other actors' transitions refused | `assignee` is a list filter ([source](https://github.com/eyaltoledano/claude-task-master/blob/1c7365cab1f1d8ee5b0ecc2292a9ba9cf5efea2e/packages/tm-core/src/modules/tasks/services/task-service.ts#L455-L460)); a file lock prevents lost writes ([lock](https://github.com/eyaltoledano/claude-task-master/blob/1c7365cab1f1d8ee5b0ecc2292a9ba9cf5efea2e/packages/tm-core/src/modules/storage/adapters/file-storage/file-operations.ts#L1-L27)) |
| Done without verification | Refused with `CARD_ACCEPTANCE_UNMET` | Allowed: `set_task_status` writes the status ([storage](https://github.com/eyaltoledano/claude-task-master/blob/1c7365cab1f1d8ee5b0ecc2292a9ba9cf5efea2e/packages/tm-core/src/modules/storage/adapters/file-storage/file-storage.ts#L451-L494)). The opt-in autopilot refuses to leave GREEN unless the agent reports zero failing tests; it does not run the tests itself ([orchestrator](https://github.com/eyaltoledano/claude-task-master/blob/1c7365cab1f1d8ee5b0ecc2292a9ba9cf5efea2e/packages/tm-core/src/modules/workflow/orchestrators/workflow-orchestrator.ts#L222-L230), [tool](https://github.com/eyaltoledano/claude-task-master/blob/1c7365cab1f1d8ee5b0ecc2292a9ba9cf5efea2e/apps/mcp/src/tools/autopilot/complete.tool.ts#L15-L22)) |
| Model calls | None | `parse-prd`, `expand`, `add-task` (unless title and description are given by hand), `update`, `analyze-complexity`, `scope-up`/`scope-down` and `research` send content to the configured provider ([AI service](https://github.com/eyaltoledano/claude-task-master/blob/1c7365cab1f1d8ee5b0ecc2292a9ba9cf5efea2e/scripts/modules/ai-services-unified.js#L498)) |
| API key | None | Required for API providers; not for Claude Code, Codex, Gemini CLI, Ollama or MCP sampling ([source](https://github.com/eyaltoledano/claude-task-master/blob/1c7365cab1f1d8ee5b0ecc2292a9ba9cf5efea2e/scripts/modules/ai-services-unified.js#L390-L410)) |
| Usage data by default | None; one npm version check a day, removed by `upgrade: { check: false }` | Sentry, on by default and turned off only by `anonymousTelemetry: false` in `.taskmaster/config.json`; the MCP server looks for that file from its working directory. Initialised with `sendDefaultPii: true`, full trace sampling, and AI input and output recording ([sentry](https://github.com/eyaltoledano/claude-task-master/blob/1c7365cab1f1d8ee5b0ecc2292a9ba9cf5efea2e/src/telemetry/sentry.js#L43-L94), [default](https://github.com/eyaltoledano/claude-task-master/blob/1c7365cab1f1d8ee5b0ecc2292a9ba9cf5efea2e/scripts/modules/config-manager.js#L744-L747)) |
| MCP server | `workfile mcp`, stdio, <!-- generated:tool-count -->32<!-- /generated:tool-count --> tools | `npx -y task-master-ai`, stdio, 44 tools; 7 load unless `TASK_MASTER_TOOLS` says otherwise ([registry](https://github.com/eyaltoledano/claude-task-master/blob/1c7365cab1f1d8ee5b0ecc2292a9ba9cf5efea2e/mcp-server/src/tools/tool-registry.js#L59-L118), [default](https://github.com/eyaltoledano/claude-task-master/blob/1c7365cab1f1d8ee5b0ecc2292a9ba9cf5efea2e/mcp-server/src/tools/index.js#L20-L26)) |
| Changelog | Fragments cut into releases | None for projects |
| UI | Local web UI | A VS Code Kanban extension; no local web UI (Hamster, the optional hosted storage, is a web app) |
| Runtime | Node.js ≥ 22 | Node.js ≥ 20 ([npm](https://registry.npmjs.org/task-master-ai)) |
| License | MIT | MIT with the Commons Clause, which withholds the right to sell the software; GitHub reports it as `NOASSERTION` ([LICENSE](https://github.com/eyaltoledano/claude-task-master/blob/1c7365cab1f1d8ee5b0ecc2292a9ba9cf5efea2e/LICENSE), [GitHub](https://api.github.com/repos/eyaltoledano/claude-task-master/license)) |

## Where Task Master is stronger

- **From a document to a plan.** `parse_prd` builds a task tree in one call, backed by `expand`, complexity analysis, scoping and `research`. Workfile has nothing like it; it does not call a model.
- **Adoption.** 28,071 GitHub stars and 9,868 npm downloads in the week to 2026-09-11 ([GitHub](https://api.github.com/repos/eyaltoledano/claude-task-master), [npm](https://api.npmjs.org/downloads/point/last-week/task-master-ai)).
- **A small default MCP surface.** 7 tools unless configured, against Workfile's <!-- generated:tool-count -->32<!-- /generated:tool-count --> always.
- **Provider breadth,** including routes that need no API key.
- **Execution automation.** An autopilot TDD state machine that commits, and a loop that re-runs Claude Code.
- **Editor integration.** A VS Code Kanban extension and rule files for many editors.
- **Node.js 20** is enough.

## Where Workfile is stronger

- **Nothing leaves the machine** but a daily version check you can turn off, and no model is ever called.
- **One file per record.** Two branches that touch different cards touch different files, and each change is read in the pull request.
- **Claims that refuse** and **a done gate** that holds whichever surface writes — CLI, HTTP or MCP.
- **History and typed memory** beside the work.
- **Plain MIT.**

## Which to choose

- **Task Master** if the hard part is turning a spec into tasks and a model doing it is welcome.
- **Workfile** if the hard part is several agents executing without stepping on each other and proving the result, with nothing sent anywhere.
