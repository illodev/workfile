---
id: T-0136
title: Glama has crawled the server and cannot score it, because nobody claimed it
status: next
type: task
priority: medium
area: infra
created: 2026-08-02
updated: 2026-08-02
---

Glama found Workfile on its own, as [[DOC-0004]] said it would, and read it
accurately: 30 tools, 4 resources, 3 prompts, licence graded A. Everything
else on the page is blank.

- Quality: `–`, "not tested"
- Maintenance: no data
- "This server cannot be installed"
- "Unclaimed servers have limited discoverability"

The badge embedded in the `punkpeye` line renders that `–`, which is why the
list's bot asked on [#11406](https://github.com/punkpeye/awesome-mcp-servers/pull/11406)
for the server to be evaluated. A crawl is not an evaluation.

## Two steps, and only the first is cheap

**Claiming** takes a GitHub login as the repository's author, from the admin
panel. No secret is stored anywhere and it lifts the discoverability penalty
on its own. There is a second route — a `glama.json` naming maintainers, for
repositories owned by an organisation — which this one does not need.

**Scoring** is the expensive half. Glama grades quality from a built image, so
it wants a Dockerfile configured at
`glama.ai/mcp/servers/illodev/workfile/admin/dockerfile`, a build test, and
then a release published through Glama. That unlocks the security scan,
deploy-from-Glama, and the A grade.

This repository has no Dockerfile and no reason to have grown one: Workfile is
a local-first CLI and stdio server that installs with `npx`, and the container
would exist to be scored rather than to be run. The image is also the wrong
shape for the product — the server's whole job is to read and write `.project/`
in the repository it is pointed at, so a useful container needs the workspace
bind-mounted and is mostly a wrapper around that.

So the two halves are worth deciding separately. Claim now; treat the
Dockerfile as its own question, and if the answer is yes, file it as a card
about shipping a container that people would actually run, not about a score.

## Acceptance criteria

- [ ] The server is claimed on Glama and no longer marked unclaimed
- [ ] The listing carries the description and links this repository states,
      rather than whatever the crawler inferred
- [ ] The Dockerfile question is answered in writing, either way
- [ ] If the answer is no, the `punkpeye` line is reconsidered — the badge
      advertises a score that will not arrive
