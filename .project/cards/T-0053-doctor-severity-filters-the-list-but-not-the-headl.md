---
id: T-0053
title: doctor --severity filters the list but not the headline or rule counts
status: done
type: bug
priority: medium
area: core
source: .project/docs/research/DOC-0001-fube-session-feedback-verified-triage.md
tags: [fube-feedback, doctor, cli]
scope: [packages/workfile/bin/workfile.ts, packages/workfile/test/cli.test.ts]
created: 2026-07-31
updated: 2026-07-31
---

`--severity error` computes `shown` (`bin/workfile.ts:1571-1575`) and prints the
filtered issues at `:1589`. Two other places ignore it:

- `:1587` renders the headline from `report.counts`, unfiltered, so a repository
  with no errors still prints `0 errors, 688 warnings`.
- `:1600` builds the "By rule" block from `report.issues`, unfiltered, so the
  entire per-rule warning breakdown prints under `--severity error`.

The `--json` branch (`:1579-1584`) has the same split: `issues` is filtered,
the spread `...report` carries unfiltered `counts`.

An agent on a large repository reported asking for errors only and receiving the
one line it wanted wrapped in the hundreds it had explicitly filtered out.

## Scope

Derive the headline and the rule grouping from `shown` when `--severity` is set,
and reconcile `counts` in the JSON payload the same way. Keep the total
discoverable — a suppressed-count line is fine — but the requested filter must
apply to every part of the output, not just the list.

## Activity

- 2026-07-31 20:22Z session-fube-triage · claimed
- 2026-07-31 20:31Z session-fube-triage · doing → done

## Verification

- 2026-07-31 20:31Z session-fube-triage — Runtime: built dist against a fixture copy carrying 1 error and 7 warnings. Plain `doctor` reports "1 errors, 7 warnings" with all three rules grouped; `doctor --severity error` reports "1 errors, 0 warnings", lists only missing-source, groups only missing-source, and prints "… 7 below --severity error suppressed". JSON counts follow the filter and carry `suppressed: 7`. Exit code still keys off unfiltered errors, which is unchanged because no severity floor can suppress an error.
