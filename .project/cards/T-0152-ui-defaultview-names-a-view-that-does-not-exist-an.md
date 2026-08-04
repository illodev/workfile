---
id: T-0152
title: ui.defaultView names a view that does not exist, and nothing reads it
status: review
type: bug
priority: low
area: core
created: 2026-08-04
updated: 2026-08-04
scope: [packages/workfile/src/config/defaults.ts, packages/workfile/src/types.ts, packages/workfile/docs/SPEC.md]
---

`DEFAULT_CONFIG.ui.defaultView` is `"work"` (`src/config/defaults.ts:263`) and
SPEC:314 teaches it inside the canonical config file. Two things are wrong with
it.

**Nothing reads it.** Across `src/`, `bin/`, `ui/src/` and
`packages/search-local/`, the identifier appears exactly twice: the declaration
above and its type at `src/types.ts:132`. It reaches no consumer. Of the 60
keys in `DEFAULT_CONFIG` it is the only one with that property — every other
key is read somewhere.

**Its default is not a view.** The board's navigation declares ten view ids
(`ui/src/main.tsx:289-308`): `overview`, `explorer`, `triage`, `flow`, `epics`,
`timeline`, `docs`, `memory`, `history`, `health`. There is no `work`. So even
once something reads the key, the shipped default selects nothing.

`defaultView` is typed `string` rather than a union, which is why neither the
compiler nor `validate-config.ts` has an opinion about `"work"`.

## Why this is not a documentation card

The SPEC line is accurate about the schema — the key really is in
`DEFAULT_CONFIG`. Deleting the line would hide the defect rather than fix it.
The question is a product one: is opening the board on a configured view a
feature this project wants?

- **If yes:** wire it in the UI's initial view state, narrow the type to the
  ten ids, validate it in `validate-config.ts` so a typo fails at load, and
  pick a real default. Then the SPEC line becomes true as written.
- **If no:** remove the key from `DEFAULT_CONFIG`, `ProjectUiConfig` and
  SPEC 8.1. A schema change needs a `SCHEMA_MIGRATIONS` entry so existing
  configs carrying the key do not start failing validation.

Do not split the difference by leaving it typed `string` and unread. That is
the current state and it is the thing that made this hard to see.

## Discovered by

A sweep for config keys never referenced outside `defaults.ts`, `types.ts` and
`define-project.ts`, during the documentation audit that opened T-0149, T-0150
and T-0151. Worth keeping as a check somewhere: an inert config key is
undetectable by reading either the code or the docs alone.

## Acceptance criteria

- [x] The wire-it-or-remove-it decision is made and recorded
- [x] `defaultView` is either read by the UI or absent from the schema
- [ ] If kept, its type is the ten view ids and a bad value fails at load
- [x] If removed, a schema migration carries existing configs
- [x] SPEC 8.1 agrees with whichever outcome ships
- [x] `pnpm run check` green, doctor 0/0

## Activity

- 2026-08-04 19:42Z illodev@local#cfe281b4 · claimed
- 2026-08-04 19:44Z illodev@local#cfe281b4 · doing → review

## Notes

- 2026-08-04 19:44Z illodev@local#cfe281b4 — Removed, on Alvaro's call between the two outcomes the card set out. Gone from DEFAULT_CONFIG, ProjectUiConfig and the SPEC 8.1 example.

Criterion 4 asked for a schema migration and none was needed — checked rather than assumed. SCHEMA_MIGRATIONS is empty by design and a step lands there alongside a change that raises SCHEMA_VERSION; dropping a config key does not, because the storage format is untouched. validateProjectConfig has no unknown-key pass at all, so a config still setting ui.defaultView merges it and nothing looks at it. Verified against a workspace whose project.config.mjs still carries the key: doctor and card list both run with no configuration diagnostic about it. The same probe with ui.port: 'nope' fails CONFIG_UI_PORT_INVALID, so the validator is live and the first result is not vacuous.

Criterion 3 does not apply — it was conditional on keeping the key.

pnpm run check exit 0, suite 275/275, ratchet 554 across 56 files none new, doctor 0/0. This one is a source change rather than a doc change, so CI on both platforms is the verification that matters. Stays in review. Uncommitted.
