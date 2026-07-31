---
id: T-0055
title: Enum errors carry the valid values and print only some of them
status: done
type: bug
priority: medium
area: core
source: .project/docs/research/DOC-0001-fube-session-feedback-verified-triage.md
tags: [fube-feedback, errors, agent-experience]
scope: [packages/workfile/src/modules/cards/validation.ts, packages/workfile/src/modules/docs/docs.ts, packages/workfile/bin/workfile.ts]
created: 2026-07-31
updated: 2026-07-31
---

The card validator already attaches the valid values to the error
(`src/modules/cards/validation.ts:110-114`), and `--json` prints them:

```json
"details": { "field": "area", "value": "treasury", "allowed": ["general"] }
```

The text renderer drops the details, so a text-mode caller gets
`CARD_ENUM_INVALID: Invalid area: treasury` and has to go read
`project.config.mjs` to learn what would have worked. The information is already
in hand at the moment of failure; it is simply not printed.

The document enums are a step worse. `DOC_KIND_INVALID` and `DOC_STATUS_INVALID`
(`src/modules/docs/docs.ts:316-327`) never attach `allowed` at all, so even the
JSON caller is left guessing. This was hit live while filing this batch:
`doc create --kind report` failed with `Invalid document kind: report` and no
hint that `research` was the near miss.

## Scope

Render `details.allowed` in the text error path when present, and attach
`allowed` to the document kind and status errors so both surfaces have it. Sweep
the other validators for enum checks that fail without naming the alternatives.

The reporting agent called the enum error "buenísimo" because it drove them to
the config — which is the point: it was good enough to be worth finishing.

## Activity

- 2026-07-31 20:22Z session-fube-triage · claimed
- 2026-07-31 20:31Z session-fube-triage · doing → done

## Verification

- 2026-07-31 20:31Z session-fube-triage — Runtime: `card create --area treasury` now prints `CARD_ENUM_INVALID: Invalid area: treasury` followed by `  valid values: general`; `doc create --kind report` prints the eight document kinds, `research` among them — the exact error that cost a call while filing this batch. JSON payloads carry `details.allowed` on both. Sweep result: the changelog and memory enum checks are doctor rules rather than thrown ValidationErrors, so they surface in a report the caller is already reading rather than at a failed command; left alone deliberately.
