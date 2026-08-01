---
id: T-0088
title: SPEC teaches five commands the binary rejects, and no test catches it
status: backlog
type: bug
priority: medium
area: docs
created: 2026-08-01
updated: 2026-08-01
---
Five commands SPEC.md teaches do not exist. All five verified today:

| SPEC line | command | result |
|---|---|---|
| 1343 | `workfile card edit T-0042` | `CLI_COMMAND_UNKNOWN` |
| 1361 | `workfile docs search "…"` | `CLI_COMMAND_UNKNOWN` |
| 1363 | `workfile docs open DOC-0012` | `CLI_COMMAND_UNKNOWN` |
| 1385 | `workfile memory search "…"` | `CLI_COMMAND_UNKNOWN` |
| 1387 | `workfile memory graduate LRN-0017 --to convention` | exits 0, then `doctor` reports `memory-missing-reference: convention` |

`test/documentation.test.ts` already opens SPEC.md — it checks that named paths
exist and that no doc spells the removed `project` binary. It does not read the
commands. T-0076 fixed one instance of this by hand and its own body says the
drift is wider and worth its own audit. This is that audit.

## The fix

Do **not** split SPEC.md into rationale and a normative spec with a fixture
registry, which is what the originating item proposed. The frontmatter codec's
inverse property — its stated first fixture family — is already proven in both
directions with adversarial inputs at `test/frontmatter.test.ts:12`.

Add one test to `documentation.test.ts`: scan fenced blocks and code spans in
the documented set for `workfile <word> <word>`, resolve word+subcommand against
the CLI dispatch table (arguments and flags ignored), fail on any path the
dispatcher does not know. Catches all five, costs about 120 ms.

Do not build a "run every SPEC command" harness: 23 of 28 §19 lines exit
non-zero in a fresh workspace, almost all because they use illustrative ids or
omit a required flag in a syntax example. Command-path resolution is the honest
signal; exit status is not.

Fix the six lines in the same card. `--to convention` and the `--verbose` MUST
at :218 are argument semantics rather than command paths — correct them by hand
and note them.

## Acceptance criteria

- [ ] A test resolves every documented command path against the dispatch table
- [ ] It fails on SPEC.md as it stands today, naming all five
- [ ] The six lines are corrected and the test passes
- [ ] The test costs under a quarter second
