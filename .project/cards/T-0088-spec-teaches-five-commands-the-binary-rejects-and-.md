---
id: T-0088
title: SPEC teaches five commands the binary rejects, and no test catches it
status: doing
type: bug
priority: medium
area: docs
created: 2026-08-01
updated: 2026-08-01
claimed_by: claude-opus-5
claimed_at: "2026-08-01T20:46:21.433Z"
scope: [packages/workfile/docs/SPEC.md, packages/workfile/test/documentation.test.ts]
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

- [x] A test resolves every documented command path against the dispatch table
- [x] It fails on SPEC.md as it stands today, naming all five
- [x] The six lines are corrected and the test passes
- [x] The test costs under a quarter second

## Activity

- 2026-08-01 20:46Z claude-opus-5 · claimed

## Notes

- 2026-08-01 20:53Z claude-opus-5 — The test names five, but not the card's five. It catches card edit, docs search, docs open, memory search — and docs index at SPEC:1364, which the card's table missed. It does not catch memory graduate --to convention, which is correct: that path resolves and the defect is in the argument. --to takes record IDs (bin/workfile.ts: listOption("--to") into graduateLearning), so --to convention writes a reference to a record named convention. Two of the six lines are argument semantics and stay hand-fixed, as the card says.
- 2026-08-01 22:22Z claude-opus-5 — Six lines corrected: card edit -> card patch --json-input; docs search -> search --kind doc; docs open -> docs show; docs index deleted (docs list is four lines up in the same fence); memory search -> memory list --query, which stays in the namespace and is better than redirecting to global search; --to convention -> --to CONV-0001. SPEC:218's --verbose MUST rewritten to describe what is true; the product question is T-0097. Every replacement was run in a throwaway workspace. The audit also found three defects outside this card: T-0095 (card and doc ask for an ID instead of rejecting an unknown subcommand), T-0096 (seven docs still name project as the binary, below the existing test's regex), T-0098 (cli.md still states the pre-T-0091 global flag contract).

