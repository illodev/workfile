---
id: T-0141
title: Glama lists no tools, because it never inspected the server capabilities
status: next
type: task
priority: low
area: infra
created: 2026-08-03
updated: 2026-08-03
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

- [ ] It is established, from Glama's documentation or from support, whether
      capabilities inspection requires a published Glama release
- [ ] If it does not, the manual sync in the admin interface is run and the
      Schema tab is checked again
- [ ] If it does, [[T-0136]]'s decision is revisited against discovery rather
      than against the score, and the outcome is recorded either way
- [ ] `.project/docs/DOC-0004` states the conclusion, so the next registry
      submission does not rediscover it

## Blocked on

Glama's admin interface is part of an SPA served from `static.glama.ai`, which
returns 526. Nothing in the admin can be reached until that clears. The sync
button and the support channel both live behind it; `support@glama.ai` is the
address their release documentation gives and does not need the SPA.
