---
id: T-0079
title: release and transition omit the actor default, silently skipping the guard
status: backlog
type: bug
priority: high
area: core
created: 2026-08-01
updated: 2026-08-01
---

At `bin/workfile.ts:917` (`release`) and `:933` (`transition`) the actor is `option("--actor")` with no `|| defaultActor()` — unlike `note` (:835), `claim` (:899) and `next` (:1842).

The ownership guard is `claimed_by && actor && claimed_by !== actor && !force`. An undefined actor makes the conjunction false, so the guard evaporates rather than refusing.

## Why it matters

The shipped Claude Code plugin runs `card transition $1 review` with no `--actor` in `/done`. The primary finalization path bypasses the ownership check.

`mutations.ts:514` carries a comment saying the transition guard exists *because* transitioning was the way around the release guard. That fix is inert from the CLI.

No test covers release-without-actor.

## Fix

Add `|| defaultActor()` at both sites, in the same commit that wires `force: has("--force")` into `transitionCard` and documents it — the default alone turns a silent force into an unescapable wall for `/done`. Depends on the identity fix landing first.
