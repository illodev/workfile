---
id: T-0080
title: agents context returns an empty bundle, reaching no decisions or learnings
status: review
type: bug
priority: medium
area: mcp
created: 2026-08-01
updated: 2026-08-01
scope: [packages/workfile/src/modules/agents]
---

Measured in this repository: `pnpm workfile agents context --json` returns `totalAvailable: 0` and an empty `records` array. The repo that defines the protocol produces an empty session brief.

## Causes

- `buildAgentContext` (`agents.ts:471`) never includes learnings or decisions on any path, so every ADR and LRN is unreachable from the command the protocol tells agents to run first.
- Conventions are filtered to `active`. CONV-0001 is `draft`, so it is dropped silently.
- With no `--card` there is no card-less bundle at all.

## Fix

A card-less bundle: claims held by this actor, cards in `doing`/`review`, high-confidence learnings, active **and draft** conventions (draft marked, not dropped), unexpired context. Hard byte cap with a documented drop order.

Only wire a PreCompact hook after this — a hook that emits an empty brief is worse than no hook.

## Activity

- 2026-08-01 16:22Z agent:claude · claimed
- 2026-08-01 16:22Z agent:claude · claimed
- 2026-08-01 16:26Z agent:claude · doing → review

