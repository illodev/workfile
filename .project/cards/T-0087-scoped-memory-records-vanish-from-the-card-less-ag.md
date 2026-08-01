---
id: T-0087
title: Scoped memory records vanish from the card-less agent bundle
status: backlog
type: bug
priority: medium
area: core
created: 2026-08-01
updated: 2026-08-01
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

- [ ] An accepted ADR with `scope: [x]` appears in `agents context` with no `--card`
- [ ] A regression test mirrors T-0080's draft-convention test
- [ ] Scoped records still filter correctly when a focus card is given
