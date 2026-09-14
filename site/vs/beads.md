---
title: Workfile vs Beads — issue tracking for AI coding agents, compared
label: vs Beads
description: Beads is a Go issue tracker on Dolt with a dependency graph and atomic claims. Workfile keeps Markdown in git, scopes claims to paths and refuses done with open criteria.
checked: 2026-09-14
---

# Workfile vs Beads

Beads (`bd`) is an issue tracker built for coding agents: one Go binary, issues in a Dolt database, a ready queue computed from its blocking dependencies (four of its nineteen dependency types), and a claim that refuses an issue someone else holds. Workfile keeps its records as Markdown files in the repository instead of a database, scopes a claim to paths and keeps enforcing it after the claim, and refuses `done` while an acceptance criterion is unchecked. Beads is far more widely used and has the richer dependency model; it also sends usage metrics unless they are turned off.

Read against Beads [v1.2.2](https://github.com/gastownhall/beads/releases/tag/v1.2.2) — its latest stable release, from 2026-08-15 — at commit [`6c12420`](https://github.com/gastownhall/beads/tree/6c124203e771433a3550c348771a5b5e27fd3c21), and `@illodev/workfile` 0.13.2. The metrics were also observed in the released binary, not only read in the source. The repository has moved from `steveyegge/beads` to `gastownhall/beads`.

## Side by side

| | Workfile 0.13.2 | Beads 1.2.2 |
| --- | --- | --- |
| Records live in | Markdown files in `.project/`, versioned by git | A Dolt database, embedded by default under `.beads/embeddeddolt/`; `issues.jsonl` is an export ([README](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/README.md#L118-L132), [sync](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/docs/SYNC_CONCEPTS.md#L3)) |
| Record types | Cards, docs, changelog fragments and releases, typed memory | Issues of twelve built-in types, including epic, decision and gate ([types](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/internal/types/types.go#L524-L535)); nineteen dependency types ([dependencies](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/internal/types/types.go#L781-L811)); key-value memories ([memory](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/cmd/bd/memory.go#L56-L59)) |
| Who holds work | A claim over paths; another actor's transition or release is refused; Claude Code asks before an edit in the scope | Claiming an issue someone else holds is refused ([claim](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/internal/storage/issueops/claim.go#L50-L92)); afterwards `bd update --assignee` overwrites the holder ([update](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/cmd/bd/update.go#L107-L109)) and `bd close` does not check it |
| Done with criteria unchecked | Refused with `CARD_ACCEPTANCE_UNMET` | Allowed: `acceptance_criteria` is free text that `bd close` does not read. Close does refuse epics with open children, unresolved gates and open blockers, unless `--force` is given ([close](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/cmd/bd/close.go#L117-L150)) |
| Changelog | Fragments cut into releases | None for projects; per-issue history from Dolt ([history](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/cmd/bd/history.go#L16-L18)) |
| MCP server | `workfile mcp`, in the same package, <!-- generated:tool-count -->32<!-- /generated:tool-count --> tools | `beads-mcp`, a separate Python ≥ 3.10 package that calls the `bd` CLI, 15 tools ([server](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/integrations/beads-mcp/src/beads_mcp/server.py), [package](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/integrations/beads-mcp/pyproject.toml#L6)) |
| UI | Local web UI | None built in; `bd graph --html` and community UIs ([list](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/docs/COMMUNITY_TOOLS.md#L10-L43)) |
| Usage data by default | None; one npm version check a day, removed by `upgrade: { check: false }` | Usage metrics on unless disabled: each command's name with the bd version, OS, timestamps and an HMAC-hashed machine ID; `bd metrics off` or `BD_DISABLE_METRICS=1` ([payload](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/cmd/bd/metrics.go#L189-L206), [default](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/cmd/bd/main.go#L1510-L1518), [off](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/cmd/bd/metrics.go#L75-L96)) |
| Runtime | Node.js ≥ 22 | A single Go binary through Homebrew, npm, `go install`, AUR or an install script ([README](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/README.md#L86-L93)) |
| License | MIT | MIT |

## Where Beads is stronger

- **Adoption.** 27,150 GitHub stars ([GitHub](https://api.github.com/repos/gastownhall/beads)), packages on Homebrew, npm and AUR, and more than ten community UIs and editor extensions.
- **No runtime to install.** A single Go binary; Workfile needs Node.js 22.
- **Claim the next ready issue in one step.** `bd ready --claim` picks and claims in one transaction ([issues.go](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/internal/storage/dolt/issues.go#L243-L251)); `bd close --claim-next` closes, then claims the top ready issue ([close](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/cmd/bd/close.go#L224-L251)).
- **The dependency graph.** Nineteen dependency types, four of which gate the ready queue ([types](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/internal/types/types.go#L845-L847)), templates that create whole graphs, and an HTML graph.
- **Gates that check themselves.** A CI run, a pull request, a timer or another issue; `bd close` refuses until they resolve, unless `--force` is given or the check cannot run ([close](https://github.com/gastownhall/beads/blob/6c124203e771433a3550c348771a5b5e27fd3c21/cmd/bd/close.go#L424-L485)).
- **Merging from Dolt.** Field-level merges, branches, push and pull between machines, and hash IDs, so issues created on different machines don't collide.
- **Integrations** with Linear, Jira, GitHub, GitLab, Azure DevOps and Notion.

## Where Workfile is stronger

- **Plain files.** Every record is a Markdown file a reviewer reads in the pull request, with no database beside the code.
- **Claims scoped to paths, enforced after the claim.** Another actor cannot move or release the card, and Claude Code asks before an edit inside its scope.
- **A done gate** on acceptance criteria, with a forced close keeping its reason.
- **History and typed memory.** Changelog fragments cut into releases; decisions, learnings, incidents and conventions that `workfile agents context` hands to the next agent.
- **One package** for the CLI, the web UI, the HTTP API and the MCP server, and no usage data sent.

## Which to choose

- **Beads** if many agents drain a large dependency graph, gates on CI and pull requests matter, and a database beside the code is acceptable.
- **Workfile** if the records should be plain files reviewed in pull requests, "done" must mean the criteria are checked, and nothing should be sent by default.
