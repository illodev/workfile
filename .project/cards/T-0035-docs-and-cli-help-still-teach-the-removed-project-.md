---
id: T-0035
title: Docs and CLI help still teach the removed project binary
status: done
type: bug
priority: medium
area: docs
created: 2026-07-31
updated: 2026-07-31
scope: [packages/workfile/bin/workfile.ts, packages/workfile/src/modules/health/doctor.ts, packages/workfile/src/modules/claude/surface.ts, packages/workfile/docs, README.md]
---
## Intent

`packages/workfile/package.json` exposes exactly two binaries, `workfile` and `workfile-mcp`. `project` is not one of them, yet the CLI's own `--help`, a doctor error message and several docs still spell commands with it. Everything below is a command a user can copy and cannot run. T-0016 fixed this class once in the README; these are the survivors it did not reach, plus what the monorepo restructure added.

Audited on 2026-07-31 against `c882325` by resolving every backticked path in the repository's Markdown, diffing the CLI's real command table against `docs/cli.md`, and counting the MCP tools against the README claim.

## Unrunnable commands, by blast radius

- `packages/workfile/bin/workfile.ts:135,139,143` — the usage block printed by `workfile --help`, compiled into `dist/` and shipped: `project ci sync`, `project claude install`, `project migrate plan`. Highest priority: it is the primary discovery surface and it ships to every consumer.
- `packages/workfile/src/modules/health/doctor.ts:148` — the `.planning` diagnostic ends with "Run project migrate plan." A user hitting this error is told to run a binary they do not have.
- `README.md:501,513` — `project ci sync --targets ...`, `project migrate plan --source .planning`.
- `packages/workfile/docs/cli.md:194,201` — the CI templates and legacy migration blocks.
- `packages/workfile/docs/mcp.md:41,116` — `project claude install`, once in a code block and once in prose.
- `packages/workfile/docs/SPEC.md:1711` — `project migrate plan`.
- `packages/workfile/src/modules/claude/surface.ts:212` — a code comment; not user-facing, but it drifts with the rest.

## Separate defect: a command that does not exist at all

`packages/workfile/docs/SPEC.md:1170` promises `project index rebuild` recreates `.project/.cache/`. There is no `rebuild` subcommand under any binary — grep over `src/` and `bin/` finds nothing. The real capability is `doctor --rebuild-cache`. Wrong binary *and* wrong command, so this needs a rewrite rather than a rename.

## Stale version callout

`README.md:13` reads "Current implementation: **0.1.3**" while the package is 0.1.4. `workfile upgrade` cannot catch this: it resyncs surfaces carrying managed markers, and this is hand-written prose outside any marked block. Worth a test that asserts the callout matches `package.json`, otherwise it goes stale again at the next bump.

## What was verified clean

- Every other backticked path in the repository's Markdown resolves. The four that do not (`.project/migrations/legacy-planning.json`, `.project/migrations/schema.json`, `.github/copilot-instructions.md`, `src/index.js`) are outputs those commands generate, not repository files.
- No stale `.mjs` script or test references survived T-0031. The remaining `.mjs` mentions are all real: `project.config.mjs`, the deliberately-unmigrated `hooks.mjs`, and file-extension lists in the security and HTTP docs.
- The README's "30 tools" claim matches `mcp inspect` exactly.
- Every `pnpm` script cited across the docs exists in one of the three manifests.
- `Node.js 22` in the README agrees with `engines: >=22`.

## Acceptance

- No `project ` command prefix survives in `bin/`, `src/`, the docs or the README.
- `SPEC.md` describes cache rebuilding through the command that actually exists.
- The README version callout matches `package.json`, ideally enforced by a test rather than by attention.

## Activity

- 2026-07-31 09:07Z claude-opus-4df73848 · claimed
- 2026-07-31 09:08Z claude-opus-4df73848 · released
- 2026-07-31 09:10Z claude-opus-4df73848 · claimed
- 2026-07-31 09:20Z claude-opus-4df73848 · doing → done
- 2026-07-31 09:21Z claude-opus-4df73848 · released

## Notes

- 2026-07-31 09:08Z claude-opus-4df73848 — README version callout removed: the blockquote at `README.md:12` no longer names a version, keeping the architecture prose intact. No pinned 0.1.x string survives anywhere in the README.

- 2026-07-31 09:20Z claude-opus-4df73848 — Fixed and verified against the rebuilt binary.

  **What changed.** Every `project`-prefixed command is gone from `bin/workfile.ts` (the usage block, seven lines), `src/modules/health/doctor.ts` (the `.planning` diagnostic), `src/modules/claude/surface.ts` (comment), `README.md`, `docs/cli.md`, `docs/mcp.md` and `docs/SPEC.md`.

  **Three defects the card had missed**, found while sweeping rather than pattern-matching the original list:

  - `bin/workfile.ts:369` — the `CLI_ARGUMENT_UNKNOWN` template told *every* user of *every* mistyped flag to run `project <cmd> --help`. The original grep missed it because the command word is interpolated.
  - `SPEC.md` section 30 recommended `workfile doctor --strict` and `project index verify` for protected branches. Neither exists; `--strict` is not a doctor flag. Replaced with `doctor --severity warning`, `changelog verify` and `memory verify`.
  - `SPEC.md` section 19.1 listed `project`, `project migrate`, `project index` and `workfile docs` (the command is `doc`, singular) as entry points. Replaced with the sixteen real ones.

  `SPEC.md` 17.3 now cites `doctor --rebuild-cache` instead of the nonexistent `project index rebuild`. The `hooks.mjs` stderr prefix moved to `workfile hook`; `build:plugin` regenerated the plugin copy and `diff` confirms byte-identity with the source.

  **Runtime evidence.** `workfile --help` on the rebuilt binary shows zero `project`-prefixed lines, and the seven ci/claude/migrate lines all read `workfile`. A mistyped flag now answers `Run [workfile doctor --help]`. `pnpm run check` exits 0: 165 + 7 tests, 0 failures.

  **Regression guard.** `test/documentation.test.ts` (new, added under T-0036) fails if any shipped doc or source names the removed binary in a code span or block. Proved by reintroducing `project ci sync` into `docs/cli.md` and watching it fail with the file and reason, then reverting.
