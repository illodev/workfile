---
id: T-0180
title: workspace.paths.sources resolves a directory nothing creates or reads
status: done
type: chore
priority: low
area: core
created: 2026-08-05
updated: 2026-08-05
---

`loadWorkspace` resolves `storage.sources` to `.project/sources` and puts it
on `workspace.paths`. Nothing else in the package mentions it: no module reads
it, no command writes to it, and since [[T-0173]] `init` no longer creates it
— the generated config indexes `.project/specs`, so that is the directory that
now exists.

So the workspace object carries a resolved path to a directory that will not be
there, and `paths` is otherwise a set of places records actually live. A reader
reasonably concludes something uses it.

The spec lists `sources/` in the `.project/` layout alongside `specs/`, both
optional, so removing the path is a spec question rather than a cleanup. Either
the directory has a purpose that was never built, or the entry goes.

Low because nothing is broken by it. Recorded because the next person to read
`load-workspace.ts` will spend the same ten minutes finding out it is dead.

## Acceptance criteria

- [x] Either `storage.sources` has a documented purpose or it is removed
- [x] The spec layout and the workspace paths agree about which directories exist

## Activity

- 2026-08-05 15:44Z illodev@local#2cddaf94 · claimed
- 2026-08-05 16:00Z illodev@local#2cddaf94 · doing → review
- 2026-08-05 17:20Z illodev@local#2cddaf94 · review → done

## Notes

- 2026-08-05 15:59Z illodev@local#2cddaf94 — Half the premise was wrong, and it changed the fix. `.project/sources` is not a directory nothing creates: `migrate legacy` files everything it cannot classify into `sources/legacy-planning/`, and SPEC §15 defines it as where long-form raw inputs live. What had no readers was `workspace.paths.sources` — the writer rebuilt the path out of `protocolRoot` instead, as did the state file out of `paths.migrations`. Both now read the resolved entries. No behaviour changed and no test was added for it: `protocolRoot` IS `storage.root`, so both spellings are the same string, and an assertion against that would pass whichever one shipped. Verified by patching the built dist back to the old form and watching the suite stay green. What is testable is criterion 2, and it was not covered: the plan-vs-tree walk from T-0173 compares counts and paths, so a directory present in both stays invisible to it. `init creates the optional directory something points at, and not the other one` asserts `specs` exists and `sources` does not; re-adding `sources` to the init list fails it on that message.
- 2026-08-05 17:20Z illodev@local#2cddaf94 — Runtime evidence: merged to main in PR #22 (fea0cff..bda003c) and verified by the full CI matrix on the merge commit — ubuntu, macos and windows on node 22 and 24, plus smoke, doctor and codeql, all green. 328 tests + 7 search-local, strict ratchet held at 494.
