---
id: T-0182
title: check does not exercise the packaged CLI, so a removed flag fails only in CI
status: backlog
type: task
priority: medium
area: core
created: 2026-08-05
updated: 2026-08-05
---

`pnpm run check` is what CLAUDE.md tells an agent to run before finishing, and it does not run `smoke:package`. That belongs to `check:release` and to a separate CI job, so the branch that removed `init --language` ([[T-0158]]) was green locally through fourteen commits and failed on the packaged CLI at the first command the smoke test runs.

The flag-table test in `cli.test.ts` exists for exactly this class and could not see it: it compares the flags each subcommand *reads* against the documented table, so it caught `card archive --actor` in the same branch. What it does not read is the flags a *caller* sends — a test, a script, a workflow file, a generated instruction.

Two candidate routes, and they are not exclusive:

- **Assert callers against the table.** Every `--flag` literal passed to the CLI from `test/`, `scripts/` and the generated agent instructions has to appear in the table for that subcommand. Narrow, fast, and catches this exact shape — including a removed flag still taught by `AGENTS.md`.
- **Fold the smoke into `check`.** Total, and costs ~30s on every local run. The reason to consider it anyway is that `check` currently proves nothing about the artifact that ships.

Same class as CI running Windows: the gap is not that the test is missing, it is that the command the protocol names does not run it.

## Acceptance criteria

- [ ] A flag removed from the CLI fails a check that `pnpm run check` runs
- [ ] Whichever route is taken names what it still does not cover
