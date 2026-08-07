---
id: T-0220
title: check proves nothing about the artifact that ships
status: done
type: task
priority: medium
area: infra
tags: [ci]
effort: S
scope: [package.json, .github/workflows, scripts/audit-consumer.ts]
origin: [T-0182]
created: 2026-08-07
updated: 2026-08-07
related: [ADR-0021, T-0221, T-0148, T-0182]
verified:
  at: "2026-08-07T17:40:10.534Z"
  method: local
  commit: 4e8da0782fecb7e52899f7916be21ad7f3d4c775
  digest: "sha256:c48bf3eb411de20438913d97539285597e56d947adaa787979c840c49e1463f9"
---

The half of T-0182 that was deliberately not taken.

**Filed on a premise that is wrong, and the correction is the useful part.** This
card said `smoke:package` runs only under `check:release` on a tag push. It does
not: `ci.yml` has had a `smoke` job on `pull_request` since before T-0182, so a
change that breaks the packaged bin already fails on a pull request. The T-0158
failure this came from was a CI failure, exactly as intended — what was missing
was local, not in CI.

So what is actually left is a smaller question. `pnpm run check` is the command
CLAUDE.md tells an agent to run before finishing, and it does not pack the
tarball. Folding `smoke:package` in would cost roughly thirty seconds on every
local run, on the command run most often, to duplicate a job CI already runs on
every pull request. ADR-0021 records the decision not to, and why.

**What working this card actually turned up** is a gate measuring the wrong tree,
which is the same class of problem one level deeper. `pnpm audit` reads the
workspace, where root `pnpm.overrides` have rewritten the dependency graph.
Overrides are a workspace-install mechanism and do not travel to consumers, so
the gate's green says nothing about what somebody who installs a published
package resolves. Two of the four overrides — `sharp` and `adm-zip` — sit under
`@huggingface/transformers`, which is a `dependencies` entry of the published
`@illodev/workfile-search-local`. Recorded in ADR-0021 and tracked as its own
card, because the exposure is real and has no upstream fix.

## Acceptance criteria

- [x] A change that breaks the packaged bin fails before a tag is pushed, not after.
- [x] The decision is recorded, including what it costs the command agents run most.
- [x] Whatever runs it names what it still does not cover.

## Activity

- 2026-08-07 17:29Z illodev@local#42eb42f5 · claimed
- 2026-08-07 17:40Z illodev@local#42eb42f5 · released

## Notes

- 2026-08-07 17:40Z illodev@local#42eb42f5 — Closed against a corrected premise, and the correction is most of the value. This card claimed smoke:package runs only under check:release on a tag push. It does not — ci.yml has had a smoke job on pull_request since before T-0182, so criterion 1 was already satisfied by machinery that has already fired: the T-0158 failure this whole thread came from was that job working as designed. The body has been rewritten rather than left standing, because a wrong record is worse than no record in a repository whose point is durable records.
What was actually left was the smaller question, and ADR-0021 answers it: pnpm run check does not gain smoke:package. Thirty seconds on every local run of the command CLAUDE.md tells an agent to run before finishing, to duplicate a job CI already runs on every pull request, is not worth it. The asymmetry is stated as a trade rather than hidden: an agent can close a card while the repository is red on a gate it never ran locally.
Criterion 3 is met by naming the gap in the places a reader will be: cli-callers.test.ts already says it reads text and proves nothing about the artifact, and scripts/audit-consumer.ts says it reads manifests rather than the tarball and resolves only dependencies, so an optionalDependencies path npm skipped is invisible to it. smoke:package stays the only gate that touches the real artifact.
The card also turned up the same class of problem one level deeper, which is now T-0221: pnpm audit was measuring the workspace, where overrides had rewritten the graph, so its green said nothing about what a consumer installs. That is in ADR-0021 with T-0148.
- 2026-08-07 17:40Z illodev@local#42eb42f5 — local verification: pnpm run check green: 465+7 tests pass, strictNullChecks held at 488. Criterion 1 rests on the pre-existing smoke job in ci.yml on pull_request, which has already demonstrated the behaviour by failing on the T-0158 branch. ci.yml parses and now declares four jobs (check, audit, smoke, codeql) with the audit job running the workspace audit and pnpm run audit:consumer. audit:consumer exits 1 today naming four high advisories with their GHSA/CVE ids and the dependency path that reaches each, which is the intended blocking behaviour recorded in ADR-0021. doctor 0/0, memory verify 0/0.
