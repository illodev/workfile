---
id: T-0096
title: Seven docs still name project as the binary, below the test's regex
status: backlog
type: bug
priority: medium
area: docs
scope: [packages/workfile/docs/SPEC.md, packages/workfile/docs/getting-started.md, README.md, packages/workfile/test/documentation.test.ts]
created: 2026-08-01
updated: 2026-08-01
related: [T-0088]
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

- [ ] The test fails on the seven lines as they stand
- [ ] The seven lines name `workfile`, and SPEC section 19.3 script keys still pass
- [ ] No shipped doc names a binary that is not declared in package.json
