---
id: T-0171
title: init takes the defaults with no TTY and says nothing
status: backlog
type: bug
priority: low
area: core
tags: [init, field-report]
origin: [DOC-0005]
created: 2026-08-05
updated: 2026-08-05
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

- [ ] `init` without a TTY and without `--yes` says the defaults were applied
- [ ] The notice names the flag that silences it
- [ ] `--yes` suppresses it
- [ ] `--json` carries the same fact as a field rather than as prose
