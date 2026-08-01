---
id: T-0097
title: No mutating command can satisfy the verbose-root MUST, and none accepts the flag
status: backlog
type: bug
priority: low
area: core
scope: [packages/workfile/bin/workfile.ts, packages/workfile/docs/SPEC.md]
created: 2026-08-01
updated: 2026-08-01
related: [T-0088]
---

SPEC.md:218 states a normative requirement:

> Commands that mutate data MUST print the resolved workspace root in verbose mode.

Nothing implements it, and after T-0091 nothing can express it:

- `--verbose` appears in `COMMAND_FLAGS` for `ui` only, where it turns on
  request logging. `workfile card list --verbose` and `workfile doctor
  --verbose` are refused with `CLI_ARGUMENT_UNKNOWN`.
- The one place the root is printed is `bin/workfile.ts:2183`, `Workspace:
  ${workspace.root}` — inside the `ui` branch, which mutates nothing, and
  printed unconditionally rather than in verbose mode.

So the requirement is false in both directions at once: the commands it names
cannot take the flag, and the command that prints the root is not one of them.

T-0088 rewrote :218 to describe what is true, because a spec must not state a
requirement its own reference implementation refuses. That leaves the product
question open, which is what this card is for.

## The question

A resolved root is genuinely useful to print before a mutation: workspace
resolution walks five steps (`--root`, `project.config.mjs`, `.project/VERSION`,
the git worktree root, cwd) and picking the wrong ancestor writes cards into
the wrong repository. Either:

- accept `--verbose` on mutating commands and print the root, restoring the
  MUST; or
- decide the `--root` echo is not wanted and leave :218 as the descriptive line
  it now is.

A decision either way belongs in memory, not in a commit message.

## Acceptance criteria

- [ ] The call is made and recorded as an ADR
- [ ] If accepted, `--verbose` prints the resolved root before the mutation runs
- [ ] SPEC.md:218 matches the outcome

## Notes

- 2026-08-01 23:16Z claude-opus-5 — A second instance of the same shape, found in T-0096. SPEC:1299 read 'Running project with no subcommand starts the UI unless configuration disables that behavior.' The first clause is true — bin/workfile.ts:1995 is const command = process.argv[2] || "ui" — but no configuration disables it: the default is applied before any config is read, and workspace.config.ui is {host, port, open, defaultView} with no such flag. The clause was dropped and the line now says so explicitly. Whether a headless repository should be able to turn it off belongs in the same ADR as the --verbose call.
