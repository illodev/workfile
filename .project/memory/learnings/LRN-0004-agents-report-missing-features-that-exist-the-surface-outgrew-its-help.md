---
id: LRN-0004
title: "Agents report missing features that exist: the surface outgrew its help"
status: active
confidence: medium
occurrences: 4
related: [T-0056, T-0057, T-0055]
tags: [fube-feedback, discoverability, agent-experience]
created: 2026-07-31
updated: 2026-07-31
---

A long agent session against a 1,630-card repository produced three complaints
about capabilities that already shipped, and the agent caught two of them itself
before delivering:

- `doctor` noise — `--severity`, `--max-issues` and `--fix` already exist.
- Silent title truncation — `CARD_TITLE_TOO_LONG` is loud in text and JSON; the
  agent's own script had discarded stderr.
- "Creating a card takes three CLI calls" — `card create --json-input FILE`
  does it in one, with body, parent, source and tags.

The third was never caught, and it is the informative one. `--json-input` on
`card create` appears once in the whole corpus, in `SPEC.md`. `card --help`,
`docs/cli.md` and the README all show the four-flag form and stop, so the
three-call workaround was not carelessness — it was the only path any surface
taught.

The pattern: **capability grew faster than the places that announce it.** `--help`
enumerates syntax without naming the recommended path; errors compute the
information the caller needs and print part of it (`CARD_ENUM_INVALID` carries
`allowed` in JSON and drops it in text). Both leave failure as the discovery
mechanism.

What this predicts, and how to use it:

- A feature request from a competent agent is first a **documentation bug
  report**. Check whether the thing exists before scheduling it. Three for three
  here.
- Capability added without a `--help` line is capability that does not exist for
  agent callers. They do not read `SPEC.md` before acting.
- When an error already holds the answer, printing it is the cheapest
  discoverability work available — and it lands exactly when the caller is
  looking.

Counter-evidence to watch for: an agent that ignores accurate help, which would
mean the problem is prompt volume rather than surface documentation. Not seen
yet — every miss so far was information the project never presented.
