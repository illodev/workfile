---
id: T-0158
title: Spanish output survives the translation that made records English
status: backlog
type: chore
priority: low
area: core
effort: M
scope: [packages/workfile/src/modules/agents/agents.ts, packages/workfile/src/config/defaults.ts, packages/workfile/src/types.ts, packages/workfile/src/modules/init/initializer.ts, packages/workfile/bin/workfile.ts, packages/workfile/docs]
related: [CONV-0001, T-0061, ADR-0012, T-0167]
origin: [T-0154]
created: 2026-08-04
updated: 2026-08-05
---

`config.language` was never a decision anybody took. It shipped in the first
commit, `c034193` on 2026-07-30, and it is a leftover of the era before this
repository was written in English at all: [[T-0061]] records that T-0002 through
T-0010 carried Spanish filenames under English titles, "translated when
[[CONV-0001]] was adopted". The translation moved the records. The code that
renders Spanish stayed.

## What is actually there

| Surface | State |
|---|---|
| `isEs` branches | 15, **all in `src/modules/agents/agents.ts`** — protocol body, workflows, adapters, context bundle |
| UI labels | **none**, despite the SPEC promising them |
| Record bodies | **none** — CONV-0001 made them English |
| `language` plumbing | `types.ts`, `defaults.ts`, `initializer.ts` (written into every generated `project.config.mjs`), `bin/workfile.ts` ×4 |
| Docs | `cli.md`, `SPEC.md` invariant 4 and its summary block, and `getting-started.md:30`, where `--language es` is **the** worked example |

SPEC invariant 4 promises three localizable things — "UI labels, generated
instructions and record bodies". Two were never built and one was deliberately
reversed by CONV-0001. Only generated agent instructions are real, and this
repository does not set `language`, so nothing here has ever rendered them.

## What removal costs

It is a breaking change for anyone who ran `workfile init --language es`, and
the key is written into their config file. `getting-started.md` teaches the flag
on its first page, so the docs sell a feature that would stop existing.

## Design notes

Three ways to take it, to be decided and recorded before any code moves:

1. **Remove the feature.** Delete the 15 branches, the config key, the CLI
   flag, the interactive prompt, and amend SPEC invariant 4 to say the whole
   protocol surface is English. Cleanest, and matches what CONV-0001 already
   decided for records.
2. **Keep the key, drop the translations.** `language` survives as metadata a
   project can declare; nothing branches on it. Smaller blast radius, but leaves
   a config key that does nothing, which is its own kind of lie.
3. **Keep it and finish it.** Only defensible if localized agent instructions
   are a product goal. Nobody has said they are.

Option 1 unless the answer to "is Spanish output a product feature" is yes.
That question belongs to the owner, not to this card.

Whichever lands, `agents context` gained two more `isEs` branches under
[[T-0154]] — kept consistent with the four already in that file rather than
leaving one surface half-translated. They go the same way as the rest.

## Acceptance criteria

- [x] The decision between the three options is recorded as an ADR before code moves
- [ ] SPEC invariant 4 and its summary block agree with what the code does
- [ ] `getting-started.md` no longer teaches a flag that does not work
- [ ] A config that still declares `language` loads and runs unchanged
- [ ] `pnpm run check` green, doctor 0/0

## Notes

- 2026-08-05 10:41Z illodev@local#2cddaf94 — The owner decided on 2026-08-05: option 1, remove Spanish outright. Recorded as ADR-0012, so this card's first acceptance criterion is met and the code can move. The trigger was DOC-0005, an external field report whose headline finding was a Spanish acceptance heading silently disabling the done gate. Worth reading before this lands: removing Spanish does not fix that. T-0167 measures the same silence against 'Definition of done' and 'Success criteria'.
