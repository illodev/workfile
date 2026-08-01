---
id: ADR-0006
title: Workfile documents its boundary against agent configurators instead of competing with them
status: accepted
created: 2026-08-01
updated: 2026-08-01
---
## Context

"Why Workfile and not gentle-ai?" is a question the project will keep being
asked, because both tools install themselves next to a repository that an agent
works in. Without an answer in the README, every reader has to derive the
distinction themselves, and most will not.

## Decision

State the boundary explicitly, name the class of tool, and frame it as
composition rather than competition. An ecosystem configurator answers *how your
agent works* — persona, skills, model routing, MCP wiring, review gates, across
many agents. Workfile answers *what was done, who holds it and on what
evidence*, in files that outlive the agent and the package.

The README's `## Boundaries` section carries the argument; the package README
carries a short form for the npm landing page, linking back.

## Consequences

- The comparison names one project as an example. That is deliberate: an
  unnamed comparison answers nobody's actual question. It must stay accurate and
  non-dismissive — if the named project's scope changes, the paragraph is wrong
  and should be corrected or dropped, not defended.
- Claims made in that section are load-bearing and must remain true of the
  code: enforced ownership at the mutation, `done` requiring runtime evidence,
  a single record set behind UI, changelog and releases, and no exclusive state
  outside the repository. Removing any of them means editing this section too.
- The negative half is equally binding. Workfile does not install agents, ship a
  persona, route models or curate skills. Building any of those contradicts a
  published claim and needs this decision superseded first.
