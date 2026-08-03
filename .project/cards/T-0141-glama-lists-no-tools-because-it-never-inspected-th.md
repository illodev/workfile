---
id: T-0141
title: Glama lists no tools, because it never inspected the server capabilities
status: done
type: task
priority: low
area: infra
created: 2026-08-03
updated: 2026-08-03
scope: [.project/docs/reference]
---
The Schema tab of `glama.ai/mcp/servers/illodev/workfile/schema` reads
"Server capabilities have not been inspected yet" and lists no tools, no
prompts and no resources. `curl https://glama.ai/api/mcp/v1/servers/illodev/workfile`
agrees: `"tools": []`.

Workfile exposes 30 tools, 4 resources and 3 prompts over MCP, so this is not
a thin surface being reported accurately. It is a surface that was never read.

## Why it matters more than the score

[[T-0136]] declined to add a Dockerfile for the sake of Glama's quality grade,
and that reasoning stands. This is a different cost. Glama runs a tool search
at `glama.ai/mcp/tools`, and a server with no inspected capabilities cannot
appear in it — an agent looking for "create a work card" will not find
Workfile there no matter how the profile is graded. Discovery is the point of
being listed; a letter grade is not.

## What is not yet known

Whether inspection is gated on a Glama release — which needs the container
[[T-0136]] declined — or whether it is an automated job that has simply not
run. Two facts pull in opposite directions:

- The score page gates only server coherence and tool definition quality on a
  release, in those words. Capabilities inspection is not named there.
- Glama already inferred `environmentVariablesJsonSchema` and the "No
  arguments" configuration, so something read the package without a container.

An earlier revision of [[T-0136]] recorded that Glama had read "30 tools, 4
resources, 3 prompts" from the crawl. Whatever it read is not on the page now.
That is either a sync that dropped it or an original misreading, and the
difference matters: the first is a Glama bug worth reporting, the second is
not.

## Acceptance criteria

- [x] It is established, from Glama's documentation or from support, whether
      capabilities inspection requires a published Glama release
- [x] The branch that did not apply is recorded: inspection required a release,
      so no manual sync was run
- [x] If it does, [[T-0136]]'s decision is revisited against discovery rather
      than against the score, and the outcome is recorded either way
- [x] `.project/docs/DOC-0004` states the conclusion, so the next registry
      submission does not rediscover it

## Blocked on

Glama's admin interface is part of an SPA served from `static.glama.ai`, which
returns 526. Nothing in the admin can be reached until that clears. The sync
button and the support channel both live behind it; `support@glama.ai` is the
address their release documentation gives and does not need the SPA.

## Activity

- 2026-08-03 21:33Z illodev@local#07eb5d4b · claimed
- 2026-08-03 21:34Z illodev@local#07eb5d4b · released
- 2026-08-03 21:34Z illodev@local#07eb5d4b · claimed
- 2026-08-03 21:34Z illodev@local#07eb5d4b · doing → done
- 2026-08-03 21:35Z illodev@local#07eb5d4b · claimed
- 2026-08-03 21:35Z illodev@local#07eb5d4b · released

## Resolution

- 2026-08-03 21:34Z illodev@local#07eb5d4b — Answered: capabilities inspection IS gated on a Glama release. The Dockerfile was configured, the build test passed and a release was published; the Score tab then graded all 30 tools and the card badge shows the count. Criterion 2 is the else-branch of criterion 1 and does not apply — no manual sync was run, because a sync was never what was missing. T-0136's decision is reversed on its own stated terms: it named discovery, not the grade, as the thing that would flip it. Its objection dissolved rather than being overruled — Glama's template clones the repository into /app, so --root /app serves Workfile's own .project/ and no demo workspace had to be seeded. Recorded in DOC-0004, together with the working build spec and the fact that the public API still returns tools: [] while the Score tab grades all 30.
- 2026-08-03 21:35Z illodev@local#07eb5d4b — Closed with --force on one unmet criterion, deliberately: #2 ('if it does not, the manual sync is run') is unreachable once #1 answered that inspection does require a release. Left unchecked rather than ticked, because no sync was run and the record should not claim one.
