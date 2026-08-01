---
id: T-0087
title: Scoped memory records vanish from the card-less agent bundle
status: done
type: bug
priority: medium
area: core
created: 2026-08-01
updated: 2026-08-01
scope: [packages/workfile/src/modules/agents/agents.ts, packages/workfile/test/agents.test.ts]
---
`scopeMatches` (`src/modules/agents/agents.ts:454`):

```
if (!recordScope?.length) return true;
if (!cardScope?.length) return false;
```

With no focus card there is no `cardScope`, so every record that declares a
`scope` is excluded from the bundle. The code comment two functions below
already says so — T-0080 worked around it by adding an `inFlight` list rather
than fixing the predicate.

Latent today: `grep -rn "^scope:" .project/memory .project/docs` returns nothing,
so no record in this repository is scoped. SPEC.md documents scoped memory as
ordinary usage at :507 and :966. The first person to scope an ADR makes it
vanish from the command the protocol tells agents to run first — the same
failure class T-0080 existed to fix, surviving in the scope dimension.

## The fix

With no focus card there is nothing to match against, so include the record
rather than exclude it; optionally annotate it with its scope in the rendered
summary. About five lines.

Do **not** build the PreToolUse knowledge hook the originating idea proposed:
scope *is* consulted at the edit point (`hooks.mjs:301` calls `scopeCovers`),
the whole memory corpus is 12 records / 25,175 bytes, and `agents context`
already returns 10 of them in one call.

## Acceptance criteria

- [x] An accepted ADR with `scope: [x]` appears in `agents context` with no `--card`
- [x] A regression test mirrors T-0080's draft-convention test
- [x] Scoped records still filter correctly when a focus card is given

## Activity

- 2026-08-01 20:33Z claude-opus-5 · claimed
- 2026-08-01 20:41Z claude-opus-5 · doing → review
- 2026-08-01 20:41Z claude-opus-5 · review → done
- 2026-08-01 20:41Z claude-opus-5 · released

## Notes

- 2026-08-01 20:38Z claude-opus-5 — The card scoped the fix to the card-less case; the discriminator is actually whether the work's scope is known at all. 84 of 94 cards here declare a scope, but for the other 10 passing --card would have left the identical failure in place with an extra flag. One predicate covers both: unknown scope includes. A focus card that does declare a scope still filters exactly as before, asserted in the same test. renderRecordSummary now prints the scope on its own line, so a record included without its scope having been checked can be discarded deliberately rather than read as universal.
- 2026-08-01 20:41Z claude-opus-5 — Runtime evidence: repro against the built dist showed scoped=false for both the card-less and scopeless-card bundles before, true after, with a scoped focus card still excluding a foreign scope. pnpm run check green at 202 + 7 tests, strict ratchet held at 599 across 59 files, doctor 0/0. CI green on both platforms at 9ce8772.
