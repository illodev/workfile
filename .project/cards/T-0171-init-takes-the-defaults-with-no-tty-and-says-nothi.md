---
id: T-0171
title: init takes the defaults with no TTY and says nothing
status: review
type: bug
priority: low
area: core
tags: [init, field-report]
origin: [DOC-0005]
created: 2026-08-05
updated: 2026-08-05
scope: [packages/workfile/src/modules/init]
---

Reported in [[DOC-0005]] (finding 6) and reproduced at 0.6.0. Run without a
terminal and without `--yes`, `init` asks nothing, applies what it detected,
and gives no sign that it skipped the interactive path:

```
$ workfile init --root /tmp/wf-tty
Initialized Workfile at /tmp/wf-tty
Areas: general
Agent adapters: agents-md
```

The tester wanted the `claude` adapter, got `agents-md`, and had to correct
`project.config.mjs` by hand afterwards. The output is indistinguishable from a
run where those answers were chosen.

This is worth more than its severity suggests because of where it happens: an
agent running `init` on the user's behalf is always without a TTY, and that is
a supported way to start. The defaults are reasonable and applying them is the
right behaviour — the report says as much. What is missing is one line saying
they were applied rather than answered.

The report's suggested wording is close to right: name the reason, say what was
applied, and give the flag that silences it. `--yes` already exists and already
means "do not ask", so the notice should not appear when it is passed.

## Acceptance criteria

- [x] `init` without a TTY and without `--yes` says the defaults were applied
- [x] The notice names the flag that silences it
- [x] `--yes` suppresses it
- [x] `--json` carries the same fact as a field rather than as prose

## Activity

- 2026-08-05 14:59Z illodev@local#2cddaf94 · claimed
- 2026-08-05 15:15Z illodev@local#2cddaf94 · doing → review

## Notes

- 2026-08-05 15:15Z illodev@local#2cddaf94 — `askInitOptions` returned the defaults for two different situations and told the caller nothing about which. It now returns `{ options, prompted, reason }`, and the two are kept apart: `--yes` is an answer, no terminal is a circumstance. Only the second one gets a notice.

```
$ workfile init --root /tmp/wf --dry-run --json > plan.json
No terminal attached, so workfile init applied what it detected instead of asking:
  name: wf
  areas: general
  agent adapters: agents-md
  CI templates: none
Pass --yes to accept them without this notice, --agents/--areas/--name to set them, or run from a terminal to be asked.
```

On stderr, so a caller parsing `--json` off stdout is unaffected — and that caller gets the same fact as a field, which is criterion #4:

```json
"interactive": { "prompted": false, "reason": "no-tty", "silenceWith": "--yes" }
```

The field is on both the `--dry-run` output and the applied `--json` output, because the decision belongs to the run rather than to one of its two shapes. With `--yes` the reason is `"yes"`, `silenceWith` is null and stderr is empty.

The notice names what was applied rather than only that something was. The reported case was a tester who wanted the `claude` adapter, got `agents-md`, and repaired `project.config.mjs` by hand — the line that would have saved that is `agent adapters: agents-md`, not a general warning.

Covered by `init says the defaults were applied when there was nobody to ask` in `cli.test.ts`. A spawned process has no TTY on either stream, so the test is in the state under test without simulating anything. Verified non-vacuous twice against the built `dist`: with the notice call removed the test fails on `No terminal attached`, and with the condition forced true it fails on `--yes is an answer, so there is nothing to report`.
