---
id: T-0096
title: Seven docs still name project as the binary, below the test's regex
status: done
type: bug
priority: medium
area: docs
scope: [packages/workfile/docs/SPEC.md, packages/workfile/docs/getting-started.md, README.md, packages/workfile/test/documentation.test.ts]
created: 2026-08-01
updated: 2026-08-04
related: [T-0088]
origin: [T-0088]
---

`documentation.test.ts` has a test called "no doc teaches the removed project
binary". It matches ``project <subcommand>`` and nothing else, so every place
that names the binary *by itself* passes:

| file:line | text |
|---|---|
| docs/SPEC.md:7 | `> CLI name: ``project``` |
| docs/SPEC.md:198 | "would preserve the same ``project`` command" |
| docs/SPEC.md:1297 | "Running ``project`` with no subcommand starts the UI" |
| docs/SPEC.md:2074 | "The executable is ``project``." |
| README.md:101 | "what makes the ``project`` scripts that..." |
| docs/getting-started.md:12 | "globally: ``project`` lands on your PATH" |
| docs/getting-started.md:16 | "what makes the ``project`` commands resolve" |

The narrow ones are worse than the ones the test catches. `project card list`
is a line that fails when copied; SPEC.md:7 and :2074 are the document stating
normatively what the executable is called, and they name the wrong thing.
SPEC.md:12 already says the package is `@illodev/workfile`.

Found while auditing command paths for T-0088, which is a different check: that
one resolves `workfile <word> <word>` against the dispatch table and would not
see these either.

## The fix

Widen the existing test rather than adding a second one — the question is
already its own. Match ``project`` in a code span wherever the sentence is
about the binary, and fix the seven lines. Three bins are declared —
`workfile`, `wf` and `workfile-mcp` — so the vocabulary is closed and the check
can be exact. `wf` matters: README.md:91 writes `wf doctor`, and a check that
reads only the long name leaves the short one unchecked.

The `"project:agents"` package.json script keys in SPEC section 19.3 are a
namespace, not the binary, and must keep passing.

## Acceptance criteria

- [x] The test fails on the seven lines as they stand
- [x] The seven lines name `workfile`, and SPEC section 19.3 script keys still pass
- [x] No shipped doc names a binary that is not declared in package.json

## Activity

- 2026-08-01 23:07Z claude-opus-5 · claimed
- 2026-08-01 23:18Z claude-opus-5 · doing → review
- 2026-08-01 23:18Z claude-opus-5 · review → done
- 2026-08-01 23:18Z claude-opus-5 · released

## Notes

- 2026-08-01 23:16Z claude-opus-5 — Seven lines, six corrected and one left alone. README.md:101 was right: init writes a project* npm script namespace (project, project:doctor, project:agents, project:mcp), so that sentence was about scripts, not the binary. But the bare span is indistinguishable from the old binary at a glance, which is the whole reason the header survived, so the sentence now names the namespace explicitly and the test forbids the ambiguous form outright. Two lines were wrong beyond the name: SPEC:1299 also claimed configuration can disable the UI default, which nothing implements (noted on T-0097), and getting-started.md:12-16 turned out to be the stale twin of a README passage somebody had already fixed. Criterion 3 is met by a closed vocabulary rather than a general check: the test now asserts package.json declares exactly workfile, wf and workfile-mcp, so adding or removing a bin fails the test and forces a look. It cannot detect an invented name like wrkfile.
- 2026-08-01 23:18Z claude-opus-5 — Runtime evidence: the widened checks were run against git show HEAD:<file> for all eleven docs before the fix and caught exactly the seven lines the card lists; after the fix the suite is green. pnpm run check green at 203 + 7, ratchet 599 across 59 files, doctor 0/0. CI green on both platforms at 81c7a45.
