---
id: T-0136
title: Glama has crawled the server and cannot score it, because nobody claimed it
status: next
type: task
priority: medium
area: infra
created: 2026-08-02
updated: 2026-08-02
scope: [.project/cards]
---
Glama found Workfile on its own, as [[DOC-0004]] said it would, and read it
accurately: 30 tools, 4 resources, 3 prompts, licence graded A. Everything
else on the page is blank — quality `–`, no maintenance data, "this server
cannot be installed", and a stated discoverability penalty for being
unclaimed.

The badge embedded in the `punkpeye` line renders that `–`, which is why the
list's bot asked on [#11406](https://github.com/punkpeye/awesome-mcp-servers/pull/11406)
for the server to be evaluated. A crawl is not an evaluation.

## What the score page actually grades

Ten criteria, at 17% profile completion:

| Criterion | State |
| --- | --- |
| License | A — MIT |
| README | pass |
| Maintenance | B — 195 commits in 12 weeks, CI passing, "lacks stable releases" |
| `glama.json` | was missing |
| Author verification | not GitHub-authenticated |
| Related servers | none configured |
| Glama release | none |
| Server coherence | gated on a release |
| Tool definition quality | gated on a release |
| Recent usage | none in 30 days |

Only three of those are things this repository can answer. `glama.json` is
added. "Lacks stable releases" is real and not a Glama problem — the workflow
publishes to npm and the MCP Registry and creates no GitHub Release at all,
which [[T-0137]] now carries. Everything else needs a browser or a container.

## What `glama.json` does, and does not

The live schema at `glama.ai/mcp/schemas/server.json` has exactly one
property: `maintainers`, required, an array of GitHub usernames. So the file
declares who may maintain the listing and nothing else.

It does not carry the description, the links or the category. Those are set in
the Glama admin once the server is claimed, or inferred by the crawler. An
earlier version of this card assumed the file could fix the listing copy; it
cannot, and the criterion below is corrected.

## The Dockerfile question

Claiming is a GitHub login as the repository's author, stores no secret, and
lifts the discoverability penalty by itself. Do that first and separately.

Scoring is the expensive half. Glama grades quality from a built image: a
Dockerfile configured at
`glama.ai/mcp/servers/illodev/workfile/admin/dockerfile`, a build test, then a
release published through Glama. That unlocks the security scan,
deploy-from-Glama, the A grade, and — through "Try in Browser" — the only
route to the recent-usage criterion.

The case against is that the container would exist to be scored rather than to
be run. Workfile is a local-first CLI and stdio server that installs with
`npx`, and its whole job is to read and write `.project/` in the repository it
is pointed at. A useful image therefore needs the workspace bind-mounted and
is mostly a wrapper around that bind mount. Three criteria unlock at once,
which is the case for; an artifact to version and keep working, for a listing
whose traffic nobody has measured, is the case against.

## Acceptance criteria

- [x] `glama.json` exists at the repository root and validates against the
      published schema
- [ ] The server is claimed on Glama and no longer marked unclaimed
- [ ] The Dockerfile question is answered in writing, either way
- [ ] If the answer is no, the `punkpeye` line is reconsidered — the badge
      advertises a score that will not arrive

## Activity

- 2026-08-02 21:38Z illodev@local#bd44efc7 · claimed
- 2026-08-02 21:40Z illodev@local#bd44efc7 · released
- 2026-08-02 21:51Z illodev@local#bd44efc7 · claimed
- 2026-08-02 21:51Z illodev@local#bd44efc7 · released

## Notes

- 2026-08-02 21:40Z illodev@local#bd44efc7 — Added `glama.json` with `maintainers: ["illodev"]`, validated against the live schema rather than against the example on the score page:

    curl https://glama.ai/mcp/schemas/server.json
    --> required: ["maintainers"], properties: { maintainers: array of unique strings }
    glama.json validates against the live schema

The schema is the reason AC 2 changed. It carries maintainers and nothing else, so the file cannot set the listing's description or links — an earlier reading of this card assumed it could. Listing copy is set in the admin after claiming.

Reading the score page in full also turned up something that is not a Glama problem: Maintenance grades B partly on "lacks stable releases", and `gh release list` returns nothing for twelve shipped versions. The workflow tags, publishes to npm and publishes to the MCP Registry, and creates no GitHub Release. Filed as [[T-0137]] because a repository with a 25-fragment changelog and an empty releases page is worth fixing whether or not Glama ever scores anything.

Claiming and the Dockerfile stay open. Both need a browser, and the second needs a decision first.
- 2026-08-02 21:51Z illodev@local#bd44efc7 — Claiming was attempted and is blocked on Glama's side, not on ours. Their static asset host is down:

    https://static.glama.ai/client/assets/manifest-*.js   526
    https://static.glama.ai/                              526
    https://glama.ai/sign-in                              200

526 is Cloudflare failing to validate the origin's certificate. The certificate at the edge is healthy — `CN = glama.ai`, Google Trust Services, notAfter Oct 4 2026 — so the fault is the origin behind `static.glama.ai`, and the whole site loads without its JavaScript. No button anywhere responds, the Claim button included. The CORS error the browser reports is downstream of it: a 526 carries no `Access-Control-Allow-Origin`, so the browser names CORS and hides the real status.

Sign-in itself worked far enough to reach `/complete-profile`, so the account exists and only the SPA after it is dead.

Nothing to change here. Retry when `curl -o /dev/null -w '%{http_code}' https://static.glama.ai/` stops returning 526; `support@glama.ai` is the address their own release documentation gives.

Worth noting for the decision this card carries: while the site cannot be logged into, the Dockerfile question is moot, since the admin page that configures it is part of the same dead SPA.
