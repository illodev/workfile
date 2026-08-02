---
id: LRN-0012
title: Every protocol rule in the cards module has four doors
status: active
created: 2026-08-02
updated: 2026-08-02
---
`modules/cards/mutations.ts` exposes four ways to write a card —
`patchCard`, `claimCard`, `releaseCard`, `transitionCard` — plus
`patchCardBody` for the prose. Every surface funnels into them: the CLI, both
HTTP route families, MCP, and the Claude plugin through the CLI. So a rule
written inside one of them is not a rule, it is a habit at one entrance.

This has now failed four times, each found only after shipping:

- `done` requires proven acceptance criteria — lived in `transitionCard`;
  `card patch {"status":"done"}` walked past it on three surfaces. Fixed by
  `assertAcceptanceMet`.
- The activity trail must not record a command that changed nothing — lived in
  `patchCard`; the other three wrote `review → review`, a second `claimed` and
  a second `released`. Fixed by `appendMilestone` ([[T-0108]]).
- You may not act on a card another actor holds — lived in `transitionCard`
  and `releaseCard`; `patchCard` had none, so writing `claimed_by` took the
  card over silently. Fixed by `assertClaimOwnership` ([[T-0117]]).
- The trail and notes are append-only — nothing enforced it against
  `patchCardBody`, which replaced the whole body ([[T-0115]]).

The pattern in the misses is worth more than the pattern in the fixes: three
of the four were hidden by something else refusing for an unrelated reason. A
status patch on a claimed card is rejected — by the "claimed cards are doing"
invariant, not by an ownership check — so the hole only opens when the caller
satisfies the invariant. Do not read a refusal as evidence a guard exists.
Check which function raised it.

How to use this. When adding or auditing a protocol guarantee here, name the
function that enforces it and confirm all five writers reach it — and write
the test, because none of the four had one. The trail had no coverage at all
until [[T-0108]], which is why a no-op line survived every release.

What the shape of the gate should be: pass raw state and let the gate decide,
as `assertAcceptanceMet` and `assertClaimOwnership` do. `appendMilestone`
takes the verdict instead, because what counts as "nothing happened" genuinely
differs per operation — a redundant claim still rewrites `claimed_at`, so no
diff can detect one. That is the exception and it earned it; the default is
the gate computing the rule.
