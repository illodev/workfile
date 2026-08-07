---
id: LRN-0031
title: A contract needs checking from both sides, and the check has to sit in the command the protocol names
status: active
category: infra
confidence: high
related: [T-0182, T-0158, T-0220, T-0148]
tags: [ci, testing]
created: 2026-08-07
updated: 2026-08-07
---

Recorded for T-0182. `COMMAND_FLAGS` is a contract with two sides, and only one
of them was checked. `cli.test.ts` pinned the table against the flags each
subcommand *reads*, in both directions, and it worked — it caught a stale `card
archive --actor` in the very branch that broke. The branch still failed in CI,
because nothing checked the flags a caller *sends*, and the callers were the
instructions, the docs and the package smoke test.

**The generalisation.** When a table describes an interface, ask who else states
the same thing. A flag name appears in the reader, in the table, in the generated
agent instructions, in the README, in a smoke script — and every copy outside the
code is a place the compiler cannot reach. `AGENTS.md` teaching a flag that no
longer exists is worse than a broken test: an agent will run it confidently and
the repository will refuse.

**The second half, which is the one that actually cost fourteen green commits.**
The test that would have caught it existed as a *category* but ran in the wrong
command. `smoke:package` belongs to `check:release`; `pnpm run check` is what
CLAUDE.md tells an agent to run before finishing. A gate is only as strong as the
command the protocol names — same class as CI running Windows while local runs
POSIX, and the same class as T-0148, where `pnpm audit` only runs on a tag push so
the failure lands on a release instead of on a pull request.

**A trick worth reusing: do not scan what already executes.** The unit tests are
full of flags that are deliberately not real — `--bogus`, `--nonsense`,
`--statuss` — because asserting the refusal path is their job. Scanning them would
have meant an allowlist of intentional nonsense, and a real stale flag could then
hide inside it. They need no scanning at all: a test that sends a removed flag
fails when the suite runs. So the checker covers exactly the sources `pnpm run
test` does *not* execute — text, `scripts/`, and the smoke test — and says so.

**And give a text-reading check a floor.** A checker built on regexes over prose
is one refactor away from matching nothing and passing forever. `cli-callers.test.ts`
asserts it found at least 90 invocations (116 today) so a broken extractor fails
loudly instead of going quiet. Prove such a check by mutation before trusting it:
removing `--scope` from the `card claim` row names 10 caller sites, and removing
`--yes` from `init` names 3 including `package-smoke.ts` — the exact file that
failed in CI.
