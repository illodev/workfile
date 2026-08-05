---
id: CHG-0123
title: init --dry-run counts what init creates
type: fixed
area: core
visibility: public
created: 2026-08-05
updated: 2026-08-05
cards: [T-0173]
---
`init --dry-run` is the one command whose entire purpose is to be accurate
before anything is written, and it was describing a smaller workspace than it
made: 14 directories and 3 files against 19 and 9, or 21 and 11 with a CI
target selected.

Two causes, both now closed:

- `mkdir` creates the parents of every path it is given, and the plan listed
  only the leaves of its own list. Those parents are counted, stopping at the
  root — `init` runs inside a directory that already exists.
- The agent and CI surfaces are written after the plan, by a different
  function, so nine files were being created that the plan had never heard of.
  They are planned now and still written by the sync, so a managed block keeps
  exactly one writer. Their directories — `.github/workflows`, `.cursor/rules`
  — are counted with everything else.

Directory entries also say `create` or `exists`, and the summary counts only
what this run will make, so a plan over an existing workspace stops describing
a clean checkout.

`init` also creates `.project/specs` and no longer creates `.project/sources`.
The generated config indexes `.project/specs/**/*.md` and nothing anywhere
names `.project/sources`, so the directory a document was configured to live in
was missing while an empty one nobody was pointed at was present. Both are
optional under the spec; this is the one the shipped workspace refers to. A
document dropped there is indexed with no further configuration.
