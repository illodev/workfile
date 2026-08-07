---
id: ADR-0021
title: A supply-chain gate runs on pull requests and audits the tree a consumer resolves, blocking with no allowlist
status: accepted
related: [T-0148, T-0220, T-0182, T-0221]
tags: [ci, security]
created: 2026-08-07
updated: 2026-08-07
---

## Context

T-0148 and T-0220 asked the same question about two gates: `pnpm audit` and
`smoke:package` lived in `check:release`, which runs on a tag push, so a failure
landed on a release rather than on a pull request. v0.5.4 is what that cost — a
published tag whose release did nothing, `Publish to npm` never reached, and the
tag moved onto the fix.

Two things turned up while answering it, and both matter more than the timing.

**T-0220 was filed on a false premise.** `ci.yml` has had a `smoke` job on
`pull_request` since before T-0182, so a change that breaks the packaged bin
already fails on a pull request. The T-0158 failure that prompted all of this was
a CI failure working exactly as designed. What was missing was local, not in CI.
The card's body has been corrected rather than left standing.

**The audit gate was measuring the wrong tree.** `pnpm audit` audits this
workspace, and this workspace has four `pnpm.overrides`. Overrides are a
workspace-install mechanism: they rewrite resolution here and do not travel
inside a published package. Two of the four — `sharp` and `adm-zip`, added for
the libvips CVEs and GHSA-xcpc-8h2w-3j85 — sit under `@huggingface/transformers`,
which is a `dependencies` entry of the published
`@illodev/workfile-search-local`. So the overrides made the gate green and fixed
those advisories for nobody but us. T-0148's own body reads the workspace/tarball
distinction as reassuring — "nothing vulnerable was ever going to reach a
user" — and for two of the four entries it is the opposite.

Measured, not inferred: resolving what the publishable manifests declare, with no
overrides, reports four packages at high — `sharp <0.35.0`, `adm-zip <0.6.0`, and
`onnxruntime-node` and `@huggingface/transformers` through them — every one with
no fix available upstream. `@huggingface/transformers@4.2.0` is the latest release
and pins `sharp: ^0.34.5`.

## Decision

One policy for both gates, and a third gate that neither card asked for.

**Gates run on pull requests.** `pnpm audit --audit-level=high` is now its own job
in `ci.yml`, blocking, at the same threshold as the release gate. An advisory the
ecosystem publishes will turn an unrelated pull request red through no fault of
its author; that is the cost, and it buys a re-run instead of a retag. A
non-blocking version was rejected: a warning nobody must act on is not a gate, and
`check:release` would still block at tag time, so the pull-request job would be
pure noise.

**Local `pnpm run check` gains neither gate.** It is the command CLAUDE.md tells
an agent to run before finishing, it runs constantly, and both additions are slow
and need the network — `smoke:package` costs about thirty seconds to duplicate a
job CI already runs on every pull request, and the consumer audit resolves against
the registry. Supply-chain posture is a property of what gets published, not of an
edit, so it is gated where publishing is decided. This is the one place the policy
is deliberately asymmetric, and it is a trade rather than an oversight: an agent
can close a card while the repository is knowingly red on a gate it never ran.

**The consumer tree is audited, blocking, with no allowlist.**
`scripts/audit-consumer.ts` builds a manifest from the union of every publishable
package's `dependencies`, resolves it in a scratch root with
`npm install --package-lock-only --ignore-scripts` — seconds, and no platform
binaries — and fails on anything at high or above. It runs in the pull-request
audit job and in `check:release`.

No allowlist, and that is an explicit posture rather than an omission. A baseline
of accepted advisories was the alternative, and it has real precedent here in
`doctor --accept-baseline`. It was rejected for this gate: a known advisory in a
published dependency tree should stop the release, even when the fix is not ours
to make, because the alternative is a list that grows and a package that ships
with the list as its answer. The way out is to change what is shipped, not to
annotate what is.

## Consequences

**The gate was red on the day it was written, and that was the intended
behaviour.** `main` and every pull request failed the consumer audit while the
four advisories were in the published tree, and no annotation would have cleared
it. That is the whole argument for refusing an allowlist, and it held: T-0221
resolved it by changing what is shipped. `@illodev/workfile-search-local` now
reaches the same ONNX weights through `onnxruntime-web` and
`@huggingface/tokenizers`, `@huggingface/transformers` is gone, and both trees
audit clean with nothing annotated. The `sharp` and `adm-zip` overrides were
removed with it — they had become entries pinning packages no longer in the graph.

Worth keeping in view: a baseline would have made this a line on a list, and the
list would have been the answer for as long as nobody looked at it.

An override is now understood as two different things depending on where the
overridden package sits. Under a devDependency it is a real fix for the only tree
that matters — nothing ships. Under a published package's `dependencies` it is a
local silence, and reaching for one there is the mistake this decision exists to
stop. `pnpm why <package> -r` is what tells the two apart, and the script's own
comment says so.

The consumer audit reads manifests, not the tarball, and resolves only
`dependencies`. A vulnerability reachable solely through an
`optionalDependencies` path npm skipped, or a dependency a build step adds to the
published manifest, is invisible to it. `smoke:package` remains the only gate that
touches the real artifact.
