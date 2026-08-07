---
id: ADR-0019
title: doctor keeps calling a declared healthCheck, and stops trusting what it returns
status: accepted
related: [T-0213, T-0188, LRN-0028, LRN-0025, LRN-0029]
tags: [security, integrations, health]
created: 2026-08-07
updated: 2026-08-07
---

## Context

T-0213 asked whether `doctor` should call a `healthCheck` that
`project.config.mjs` declares. The exposure is real and one hop further out
than LRN-0025 recorded: `runDoctor` builds an integration registry from the
repository's own config module and calls each declared hook, inside the one
command the generated CI workflow exists to run. On a GitLab job that sees
every unprotected variable, or in the generic script that inherits whatever
environment invokes it, the templates cannot protect anything.

The audit's finding is that the framing was wrong, and LRN-0029 lists the
surfaces that make it wrong. `loadWorkspace` `import()`s `project.config.mjs`
before anything else happens, so the module body has already run — in every
command, not just `doctor`. Anything a `healthCheck` can do, the module body
can do earlier and more quietly. There is no capability the hook adds and no
boundary that removing the call would restore.

What the audit did find is a different defect, and it is not about trust
boundaries at all. `doctor` treated the hook's *answer* as its own:

- A hook that threw propagated out of `runDoctor` and took every caller with
  it — the CLI, `/api/v2/health`, `/api/health`, the MCP `project_doctor` tool
  and the MCP resource. A misconfigured integration was indistinguishable from
  a broken repository, and the report that would have said so never printed.
- A hook that never settled hung `doctor` with no bound at all, so CI died at
  its own job timeout with nothing to read.
- A returned diagnostic went uninspected into the report. `runDoctor` derives
  `counts` and `ok` from `issue.severity`, so `{ severity: "catastrophe" }`
  wrote NaN into the counts, landed in no bucket, left `ok` true, and made the
  comparator sort on NaN. An integration could decide whether the repository
  passed, by typo.

## Decision

`doctor` keeps calling declared `healthCheck` hooks. Removing the call closes
nothing — the module body runs regardless — and costs a feature whose whole
point is that an integration can report on itself in the command people already
run.

What changes is that the hook no longer speaks for `doctor`. Each call is
isolated, bounded and validated in
`packages/workfile/src/modules/integrations/registry.ts`:

- A throw becomes `integration-health-check-failed`, attributed to the
  integration by id.
- A hook that does not settle within ten seconds becomes
  `integration-health-check-timeout`, and `doctor` answers without it.
- A returned value that is not diagnostics, or an entry whose severity is not
  `error`, `warning` or `info`, becomes `integration-health-check-invalid`.
  Well-formed entries in the same batch still land: rejecting one entry is not
  rejecting the integration.

All three are errors, not warnings, because `doctor` is a gate. A declared
check that could not answer is not a pass, and there is no way to tell what a
malformed entry was trying to say.

A project that declares no integrations sees none of this, proven by a test.

## Consequences

The generated CI templates now state both hops — the module body runs, and
`doctor` calls what it declared — on all three targets rather than the first
hop on GitHub only. "It imports a config file" reads as loading settings, and
somebody pricing this from that sentence prices it wrongly.

The ten-second bound is honest about being partial, and the code says so. A
hook runs on `doctor`'s own event loop, so the timer catches an awaited hang
and cannot catch a synchronous spin: `while (true) {}` starves the timer too.
Bounding that needs the hook in a worker or a subprocess, which is a different
feature and is not built here.

The bound is reachable through `createIntegrationRegistry`'s
`healthCheckTimeoutMs` so the timeout is testable in milliseconds. `runDoctor`
does not pass it; an untested timeout is a timeout that regresses quietly, and
this one already did once — the timer was `unref`ed in the first draft, which
let Node exit before the bound fired and printed no report at all.

Containment for a repository nobody has reviewed still belongs to the job, not
to Workfile: no secrets, no write token, no evidence written back from an
unreviewed head. That is unchanged from T-0188 and is the only answer that
survives here.
