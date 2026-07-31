---
id: T-0069
title: "wf: a second bin name, and help that knows which one you typed"
status: done
type: feature
priority: medium
area: core
tags: [cli, ergonomics]
created: 2026-07-31
updated: 2026-07-31
scope: [packages/workfile/package.json, packages/workfile/bin, packages/workfile/test, packages/workfile/docs, README.md]
---

`workfile` is eight characters an agent and a human type all day. Add `wf`
as a second bin pointing at the same entry point.

The alias is one line in `bin`. What makes it worth doing properly is that
`bin/workfile.ts` hardcodes its own name in 69 usage strings and never derives
it, so `wf card --help` would answer in a vocabulary the caller did not use.
Measured: `process.argv[1]` keeps the symlink's name (`.../node_modules/.bin/wf`)
rather than resolving to the real path, so the invoked name is readable at
runtime and one substitution at print time covers all 69 lines.

## Scope

1. `bin.wf` in the package manifest, same target as `bin.workfile`.
2. Derive the invoked name once; apply it where usage and the `--help` hints
   are printed. The literals stay canonical.
3. Leave `CLI_BIN` alone.

## Decided up front

`CLI_BIN` stays `workfile`. It feeds `cliInvocation`, which emits a
package-manager prefix — `npx workfile`, `bunx workfile` — into every generated
protocol, skill and slash command. `workfile` is unregistered on npm, so that
form fails loudly when the package is not installed locally. `wf` **is**
published (v1.2.2, bins `workflow-api` and `workflow-runner`), so `npx wf`
would fetch and run a stranger's tool instead of failing. The short name is a
convenience for an installed binary, not a form to teach in generated text.

On Windows npm writes a `.cmd` shim that passes the target path, so the
derivation falls back to the canonical name there. Falling back to `workfile`
is correct rather than merely safe: that is the name that always resolves.

## Activity

- 2026-07-31 22:54Z session-fube-triage · claimed
- 2026-07-31 22:54Z session-fube-triage · claimed
- 2026-07-31 22:58Z session-fube-triage · doing → done
- 2026-07-31 22:58Z session-fube-triage · released

## Verification

- 2026-07-31 22:58Z session-fube-triage — Done, verified through a real npm install rather than a symlink alone. `pnpm smoke:package` packs the tarball, installs it into a throwaway consumer and now asserts the alias there: `node_modules/.bin/wf` exists, `wf version` prints 0.1.9, and `wf card --help` prints `wf card list` with no `workfile ` line surviving. It passed on the first run, which is the evidence that npm writes the second shim and that the derivation holds through packing.

The derivation was checked before it was written rather than assumed. Node leaves `process.argv[1]` as the executed path instead of resolving it, so a symlink named `wf` reads back as `.../wf`, not as the real `workfile.js`. That is what makes one substitution at print time cover all 69 usage literals; had Node resolved the path, the alias would have needed its own entry-point file.

Both halves speak the caller's name: the usage block and the hint a rejected flag prints, which is the line a reader is most likely to copy. A test in cli.test.ts exercises both through a symlink and asserts the canonical name is unaffected by the alias existing. `pnpm check` green at 182 + 7, strictNullChecks 647 known and none new.

`CLI_BIN` was left at `workfile`, as decided in the body. Generated protocols, skills and slash commands keep emitting `pnpm workfile …` / `npx workfile …`, which is the form that fails loudly when the package is missing instead of running the unrelated `wf` package from the registry.
