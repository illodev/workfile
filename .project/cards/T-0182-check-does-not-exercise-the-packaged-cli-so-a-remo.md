---
id: T-0182
title: check does not exercise the packaged CLI, so a removed flag fails only in CI
status: done
type: task
priority: medium
area: core
created: 2026-08-05
updated: 2026-08-07
scope: [packages/workfile/test/cli-callers.test.ts]
related: [LRN-0031, T-0220, T-0158]
verified:
  at: "2026-08-07T17:18:17.691Z"
  method: local
  commit: 4e8da0782fecb7e52899f7916be21ad7f3d4c775
  digest: "sha256:dd11bc8e72a0a90347c9acaf3cdd819d86ad1eab09e455f3e3ee7e52e8103c64"
---

`pnpm run check` is what CLAUDE.md tells an agent to run before finishing, and it does not run `smoke:package`. That belongs to `check:release` and to a separate CI job, so the branch that removed `init --language` ([[T-0158]]) was green locally through fourteen commits and failed on the packaged CLI at the first command the smoke test runs.

The flag-table test in `cli.test.ts` exists for exactly this class and could not see it: it compares the flags each subcommand *reads* against the documented table, so it caught `card archive --actor` in the same branch. What it does not read is the flags a *caller* sends — a test, a script, a workflow file, a generated instruction.

Two candidate routes, and they are not exclusive:

- **Assert callers against the table.** Every `--flag` literal passed to the CLI from `test/`, `scripts/` and the generated agent instructions has to appear in the table for that subcommand. Narrow, fast, and catches this exact shape — including a removed flag still taught by `AGENTS.md`.
- **Fold the smoke into `check`.** Total, and costs ~30s on every local run. The reason to consider it anyway is that `check` currently proves nothing about the artifact that ships.

Same class as CI running Windows: the gap is not that the test is missing, it is that the command the protocol names does not run it.

## Acceptance criteria

- [x] A flag removed from the CLI fails a check that `pnpm run check` runs
- [x] Whichever route is taken names what it still does not cover

## Activity

- 2026-08-07 17:10Z illodev@local#42eb42f5 · claimed
- 2026-08-07 17:18Z illodev@local#42eb42f5 · released

## Notes

- 2026-08-07 17:18Z illodev@local#42eb42f5 — Took the first route, and the survey changed how it was built. Scanning every caller in test/ turns up five flags that are deliberately not real — --bogus, --nonsense, --statuss, and a real flag on the wrong subcommand — because asserting the refusal path is what those tests are for. Rather than carry an allowlist of intentional nonsense, in which a genuinely stale flag could hide, the checker skips the unit tests entirely: a test that sends a removed flag already fails when the suite runs. So it covers exactly the sources pnpm run test does not execute — the generated agent instructions, the docs, scripts/, and test/package-smoke.ts — which is also where the T-0158 failure actually lived. Command-word resolution mirrors commandKey and reads USAGE_ALIASES and DEFAULT_SUBCOMMAND out of the CLI source, which the survey forced: without aliases, workfile docs create --kind in SPEC.md looked like a stale command, and it is a valid alias for doc. An invocation whose word resolves to no row is reported rather than dropped, so the reverse case would surface. The check runs in 52ms, finds 116 invocations, and asserts a floor of 90 so a regex that stops matching fails loudly instead of passing forever. Proven by mutation both halves: removing --scope from the card claim row names 10 sites across .claude, .project/agents, README, SPEC, getting-started and the plugin; removing --yes from init names 3 including package-smoke.ts:215, which is the exact file and command that failed in CI. The largest thing it still does not cover is the other route, and it is named in the test rather than left implicit: this reads text, so check still proves nothing about the packaged artifact — whether the bin ships, whether the shebang survives, whether a consumer can resolve it. Folding smoke:package into check costs ~30s on the command agents run most, which deserves its own decision alongside T-0148 since both are about a gate that only runs on a tag push. Filed as T-0220.
- 2026-08-07 17:18Z illodev@local#42eb42f5 — local verification: pnpm run check green: 465+7 tests pass (1 new), strictNullChecks held at 488. cli-callers.test.ts runs in 52ms inside pnpm run test, finds 116 caller invocations across the generated instructions, docs, scripts and package-smoke.ts, and asserts a coverage floor of 90. Mutation-proven on both extraction halves against an unmodified working tree: dropping --scope from the card claim row fails the test naming 10 caller sites, dropping --yes from init fails naming 3 including packages/workfile/test/package-smoke.ts:215 — the exact command that failed in CI for T-0158 — and bin/workfile.ts restored clean both times. doctor 0/0.
