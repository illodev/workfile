---
id: ADR-0016
title: done carries the method that proved it, and a bound criterion is machine-owned
status: proposed
created: 2026-08-05
updated: 2026-08-05
---
## Context

The protocol's strongest promise is that `done` means verified where the code
actually runs. What stands behind it is `assertAcceptanceMet` in
`packages/workfile/src/modules/cards/mutations.ts`, which refuses `done` while
any acceptance criterion is unchecked, refuses a card whose checklist sits under
a heading it cannot read, and is reached from all four doors. As far as it
reaches, the gate is sound.

It does not reach far enough, because the agent checks its own boxes.
`card ac --check 3` is a write the same actor performs on the way to `done`. The
gate proves that somebody asserted a criterion was met. It does not prove the
criterion was met, and it cannot.

Two properties make the gap wider than it looks.

`--force` leaves no trace. The trail entry a transition writes is
`${current.status} → ${wanted}` (`mutations.ts:622`) and nothing else. A forced
`done` and a proven one are the same line in the record. Every statistic anyone
would want to compute over closed cards — per actor, per model, per area — is
computed over a field that cannot tell them apart.

Nothing binds the criteria to the state that satisfied them. Checking every box
and then rewriting the criteria costs nothing and leaves a card that reads as
fully proven against text nobody ever proved.

## Decision

**Criteria stay prose in the body.** The useful distinction is not body versus
frontmatter; it is a narrative criterion a human judges against an executable
check with an exit code. Moving the prose into frontmatter costs the GitHub
rendering, the `grep` and the review comment, and buys only addressability —
which `card ac` already bought.

**A criterion may bind to a command, and a bound criterion is machine-owned.**
The commands live in frontmatter, which is the half a human should not be
hand-writing anyway:

```yaml
verify:
    - id: gate-test
      run: pnpm vitest run test/acceptance-gate.test.ts
      criteria: ["sha256:ab12…"]
```

`card ac --check` refuses a bound criterion. Only the runner writes it.

**The binding is a hash of the criterion's normalised text, not its index.**
`acceptance.ts` documents that indices are positional and that a concurrent
reorder is refused by the card lock and `expectedRevision`. That protects the
write; it does not protect the interval between proving criterion 2 and reaching
`done`. A text hash makes a reorder harmless and makes an edit to the criterion
break the binding — the wanted behaviour in both cases.

**`done` records how it was proved.**

```yaml
verified:
    at: 2026-08-05T10:12:00Z
    method: ci
    commit: 4b939fd
    run: https://…
    digest: sha256:…
```

`method` is one of `local`, `ci`, `manual` or `forced`, and the tiers are more
of the substance here than the digest is. `local` is a command that ran on the
author's machine and is still self-reported. `ci` has a witness. `manual` is
legitimate for a criterion no command expresses — the recut demo video reads
correctly — but it must be labelled rather than left indistinguishable from a
green test. `forced` replaces the invisible `--force` and carries its reason.

**The digest covers the criteria region and the `verify` block, and nothing
else.** It cannot cover the body: the `done` transition appends a trail entry
itself, so a whole-body digest would be invalidated by the very write that
created it. When the digest stops matching, `doctor` reports a card verified
against text that has since changed.

**Policy is declared per project, not remembered per agent.**
`project.config.mjs` states which methods each area accepts — `ci` for `core`,
`manual` allowed for `docs`. This is where determinism actually lands. A gate
every agent must remember to respect is a convention; a gate whose policy is a
declared value is a rule.

## Consequences

Card-declared commands are arbitrary shell executed by whatever runs them. A
card is a Markdown file, and in a repository that takes pull requests a card can
arrive from a fork; `run:` is then remote code execution on the CI runner. This
decision is not implementable without an allowlist of permitted command prefixes
in project config, and card checks must run in a job holding no secrets. The
generated GitHub workflow already sets `permissions: contents: read`, which is
necessary and nowhere near sufficient.

## Rejected

**Acceptance criteria as a frontmatter field.** It solves addressability, which
is solved, and costs the rendering that makes a card reviewable where cards are
actually reviewed.

**Stages, in the shape of a CI pipeline.** The card carries a flat list of
commands; ordering and parallelism belong to CI. The project generates three CI
targets from one template (`ci.ts`), so a stage DSL would have to be lowered
into all three — in exchange for expressing something the CI configuration
already expresses better. The card says what must be true; the CI config says
how to run things.
