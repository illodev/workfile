---
id: T-0136
title: Glama has crawled the server and cannot score it, because nobody claimed it
status: done
type: task
priority: medium
area: infra
created: 2026-08-02
updated: 2026-08-03
scope: [.project/cards, .project/docs]
---
Glama found Workfile on its own, as [[DOC-0004]] said it would. The listing is
now claimed, graded A on both criteria Glama can grade without running the
server, and blank everywhere a built container would be required.

Claiming took no browser and no login. `glama.json` with
`maintainers: ["illodev"]` is the entire mechanism: the score page reads
"Author verified — this server has been verified by its author", and the
maintainer line on the overview carries Glama's check with the title "Server
maintainers are verified by Glama". Both are server-rendered, which is how
they arrived while Glama's SPA was still down. An earlier reading of this card
assumed claiming meant authenticating as the repository's author in a browser;
the committed file did it unattended.

## What the score page grades, before and after

| Criterion | When this card opened | Now |
| --- | --- | --- |
| License | A — MIT | A |
| README | pass | pass |
| Maintenance | B — "lacks stable releases" | A — 247 commits in 12 weeks, last stable release 2 August 2026 |
| `glama.json` | missing | valid |
| Author verification | not authenticated | verified |
| Related servers | none | none |
| Glama release | none | none |
| Server coherence | gated on a release | gated on a release |
| Tool definition quality | gated on a release | gated on a release |
| Recent usage | none in 30 days | none in 30 days |

Profile completion moved 17% → 33%. Maintenance moved B → A because
[[T-0137]] made the workflow publish a GitHub Release and [[T-0138]] backfilled
the twelve that had never been created: "lacks stable releases" was the one
sentence in that grade under this repository's control, and it is gone.

## What `glama.json` does, and does not

The live schema at `glama.ai/mcp/schemas/server.json` has exactly one
property: `maintainers`, required, an array of GitHub usernames. So the file
declares who may maintain the listing, and that declaration is also what
verifies authorship — a username inside a repository only its author can
commit to is the proof.

It does not carry the description, the links or the category. Those are set in
the Glama admin once the server is claimed, or inferred by the crawler.

## The Dockerfile question, answered: not for a score

Glama grades quality from a built image: a Dockerfile configured at
`glama.ai/mcp/servers/illodev/workfile/admin/dockerfile`, a build test, then a
release published through Glama. That unlocks the security scan,
deploy-from-Glama, server coherence, tool definition quality and — through
"Try in Browser" — the only route out of the recent-usage criterion.

The answer is no, on the grounds that the container would exist to be scored
rather than to be run. Workfile is a local-first stdio server whose whole job
is to read and write `.project/` in the repository it is pointed at, and whose
documented invocation is `npx -y @illodev/workfile mcp`. A hosted image has no
repository, so every tool call in a browser trial would answer about an empty
workspace. Seeding a demo workspace into the image would fix that and would
also duplicate the static demo, which already replays this repository's real
records and costs nothing to keep current. Buying five score criteria with a
second demo surface to version is the wrong trade for a listing whose traffic
nobody has measured.

What would flip this answer is not the score. It is discovery: the Schema tab
now reads "Server capabilities have not been inspected yet" and lists no
tools, no prompts and no resources, and the API returns `tools: []`. If that
is permanent, Workfile is absent from Glama's tool search — a real cost, and a
different question from a grade. [[T-0141]] carries it, because whether
inspection is gated on a release or merely pending is not yet known and the
decision above should not be re-litigated on a guess.

## The badge on the `punkpeye` line

Reconsidered and kept. The badge renders three slots; two are now A and one is
the ungraded quality score, so it no longer advertises a blank. The bot on
[#11406](https://github.com/punkpeye/awesome-mcp-servers/pull/11406) asked for
an evaluation and that request stands unmet, but the line is honest about what
Glama does and does not know, which is what a badge is for.

## Acceptance criteria

- [x] `glama.json` exists at the repository root and validates against the
      published schema
- [x] The server is claimed on Glama and no longer marked unclaimed
- [x] The Dockerfile question is answered in writing, either way
- [x] If the answer is no, the `punkpeye` line is reconsidered — the badge
      advertises a score that will not arrive

## Activity

- 2026-08-02 21:38Z illodev@local#bd44efc7 · claimed
- 2026-08-02 21:40Z illodev@local#bd44efc7 · released
- 2026-08-02 21:51Z illodev@local#bd44efc7 · claimed
- 2026-08-02 21:51Z illodev@local#bd44efc7 · released
- 2026-08-03 09:26Z illodev@local#bd44efc7 · claimed
- 2026-08-03 09:32Z illodev@local#bd44efc7 · doing → done

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
- 2026-08-03 09:30Z illodev@local#bd44efc7 — Claimed, and nobody clicked anything. The evidence is server-rendered, which is why it arrived while the SPA is still down:

    curl -s https://glama.ai/mcp/servers/illodev/workfile/score
    --> "Author verified — This server has been verified by its author."
    --> "Has valid glama.json"
    --> "Maintenance A — 247 commits in the last 12 weeks, last stable release on August 2, 2026"
    --> "33% profile completion"

    curl -s https://glama.ai/mcp/servers/illodev/workfile
    --> <span title="Server maintainers are verified by Glama"> beside the illodev link

    curl -o /dev/null -w '%{http_code}' https://static.glama.ai/   --> 526 (still)

So `glama.json` is not only a declaration of who may maintain the listing, it is the claim itself. The card assumed a browser login and there was never one to do; committing a file to a repository only its author can push to is the proof Glama wanted. Recorded in DOC-0004 because it changes the instructions for the next directory, not just this one.

Two other things moved without being touched here. Maintenance went B to A: "lacks stable releases" was the whole complaint and T-0137 plus T-0138 answered it, so the release work paid a second time. And the overview no longer says the server cannot be installed; it now carries an install flow.

One thing moved backwards. The Schema tab reads "Server capabilities have not been inspected yet" and lists no tools, no prompts, no resources, and the API agrees with `tools: []`. An earlier revision of this card recorded that Glama had read 30 tools, 4 resources and 3 prompts from the crawl. `workfile mcp inspect --json` confirms those counts are real on our side, so what is missing is Glama's reading of them, not the surface. Filed as T-0141 rather than solved here, because it is the one argument that could overturn the Dockerfile answer and it deserves a fact instead of a guess.
