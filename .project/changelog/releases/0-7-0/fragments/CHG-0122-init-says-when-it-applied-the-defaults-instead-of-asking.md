---
id: CHG-0122
title: init says when it applied the defaults instead of asking
type: changed
area: core
visibility: public
created: 2026-08-05
updated: 2026-08-05
cards: [T-0171]
---
Run without a terminal and without `--yes`, `init` asked nothing, applied what
it detected, and gave no sign it had skipped the interactive path. The output
was indistinguishable from a run where someone chose those answers. A tester
wanting the `claude` adapter got `agents-md` and had to repair
`project.config.mjs` by hand.

Applying the defaults is right — they are detected, not invented. Saying so is
the part that was missing:

```
$ workfile init --root . --json > plan.json
No terminal attached, so workfile init applied what it detected instead of asking:
  name: my-service
  areas: api, web
  agent adapters: agents-md
  CI templates: github
Pass --yes to accept them without this notice, --agents/--areas/--name to set
them, or run from a terminal to be asked.
```

The notice names what was applied rather than only that something was, because
the line that saves the reported case is `agent adapters: agents-md`, not a
general warning. It goes to stderr, so a caller parsing `--json` off stdout is
unaffected — and that caller gets the same fact as a field:

```json
"interactive": { "prompted": false, "reason": "no-tty", "silenceWith": "--yes" }
```

`--yes` is an answer and no terminal is a circumstance, so only the second one
is reported: with `--yes` the reason is `"yes"` and stderr stays empty. This
matters more than its severity suggests, because an agent running `init` on
someone's behalf is always in the second case, and that is a supported way to
start.
