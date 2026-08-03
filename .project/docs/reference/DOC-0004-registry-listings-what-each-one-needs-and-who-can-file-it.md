---
id: DOC-0004
title: "Registry listings: what each one needs and who can file it"
kind: reference
status: current
created: 2026-08-02
updated: 2026-08-03
---
Workfile ships three artifacts people search for by capability rather than by
name: an MCP server, a Claude Code plugin and an npm package. This is the list
of places that index them, what each one verifies, and which of them this
repository can own.

The split that matters is not popularity, it is who can file the submission.
One registry verifies ownership from the artifact and therefore belongs in CI.
The rest are forms behind a human session, and no amount of repository
configuration automates them.

[[T-0133]] tracks which of the manual ones are actually filed. This document
stays the reference: requirements, copy, and order. Every field list below was
read off the live form or off a filed submission.

## Published from CI

### Official MCP Registry — `registry.modelcontextprotocol.io`

Wired into `.github/workflows/release.yml`. A `v*` tag publishes the packages
to npm, then `mcp-publisher` publishes `server.json`.

Live since `v0.4.0`: `io.github.illodev/workfile` is `active` in the registry
and names `@illodev/workfile@0.4.0`. The OIDC login was accepted on its first
run, so the namespace question below is settled rather than assumed.

Ownership is proven twice over, which is why nothing here is hand-filed:
`mcpName` in the published `package.json` must equal `name` in `server.json`,
and the version must already be on npm. `login github-oidc` reuses the
`id-token: write` permission npm trusted publishing already needs, so the
namespace `io.github.illodev/workfile` costs no stored credential. A
`com.illodev/` namespace would read better and would need an Ed25519 private
key in repository secrets — the same trade [[T-0107]] refused for the `next`
dist-tag.

Validate a change without publishing:

```sh
mcp-publisher validate
```

This is the only entry that compounds, and it compounds more than "eventually
the aggregators mirror it" suggested: PulseMCP states it ingests the official
registry daily and processes weekly. Assume any aggregator may arrive on its
own, and check before filing.

## Indexed without asking

Both of these arrive by themselves. Neither arriving is the same as either
being useful, which is the thing the first draft of this document got wrong.

### Glama — `glama.ai/mcp/servers`

Crawls public GitHub repositories with no submission. A crawl is not an
evaluation: until the server is claimed it shows quality `–`, no maintenance
data, "this server cannot be installed", and a stated discoverability penalty
for being unclaimed.

**Claiming is a file, not a login.** Commit `glama.json` at the repository
root with `{"$schema": "https://glama.ai/mcp/schemas/server.json",
"maintainers": ["<github-username>"]}` and the listing verifies itself on the
next sync — "Author verified", plus a check beside the maintainer name. A
username inside a repository only its author can push to is the proof Glama
wants, so there is nothing to click. This document previously said claiming
meant a browser session as the repository's author; it does not, and
[[T-0136]] proved it by claiming while Glama's own SPA was down.

`maintainers` is the schema's only property. It does not carry the
description, the links or the category; those are set in the admin after
claiming, or inferred by the crawler.

A quality grade costs more, and it is gated on a release. Glama scores from a
built image: a Dockerfile configured at `/admin/dockerfile`, a build test, then
a release published through Glama. [[T-0136]] declined that, reasoning the
container would exist to be scored rather than run — and it named the one thing
that would flip the answer, which was discovery rather than the grade. It did
flip. [[T-0141]] settled the open question: **capabilities inspection is gated
on a Glama release, not an automated job that had merely not run.** Until the
release existed the Schema tab read "Server capabilities have not been
inspected yet" and the server could not appear in Glama's tool search.

The objection dissolved rather than being overruled. T-0136 assumed a hosted
image would have no repository to serve, and the build spec that works clones
this one:

```json
["pnpm install --ignore-scripts", "pnpm --filter @illodev/workfile run build:core"]
```

```json
["node", "/app/packages/workfile/dist/bin/workfile.js", "mcp", "--root", "/app"]
```

Glama's template already runs `git clone` into `/app`, so `--root /app` serves
Workfile's own `.project/` — 298 tracked files. No demo workspace had to be
seeded into the image, which was the duplication T-0136 refused to pay for.
Three details that are not obvious:

- `--ignore-scripts` is not optional. `playwright` is a root devDependency and
  its postinstall downloads browsers.
- `build:core`, not `build`: the MCP server does not need the UI, and
  `prepare-bin.ts` already tolerates a missing `dist/ui/static`.
- The image's `PATH=/app/node_modules/.bin` is useless here. pnpm tries to link
  the `workfile` bin during install, before `dist/` exists, and warns three
  times. Use the absolute path to `node`.

**The public API lags the score page.** After the release, the Score tab graded
all 30 tools and the card badge showed the count, while
`GET https://glama.ai/api/mcp/v1/servers/illodev/workfile` still returned
`tools: []`. Both were checked the same day. So an empty `tools` array from that
endpoint is not evidence that inspection has not run — read the Score tab
instead, and treat the desync as Glama's rather than something to fix here.

Two criteria move without touching Glama at all. Maintenance grades partly on
GitHub Releases — publishing them lifted it B → A — and `glama.json` is a
criterion in its own right.

Tool definition quality is graded per tool across six dimensions: Behavior,
Conciseness, Completeness, Parameters, Purpose and Usage Guidelines. The first
grade was `C`, 3.2/5 across 30 tools, and the deficit was entirely in
Parameters, Completeness and Usage Guidelines while Conciseness scored highest
of the six. Length is not what it measures: one tool scored 5/5 on Conciseness
with a 65-character description. What moved it to `A` was declaring structure —
a `description` on every input property, `enum` on the vocabularies that are
genuinely closed, `default` where the implementation already had one, and an
`outputSchema` on every tool. See [[T-0146]].

The score badge resolves for any repository path — including one that does not
exist — so seeing a badge render proves nothing about being indexed. The
score inside it is the signal.

### PulseMCP — `pulsemcp.com`

Ingests the official MCP Registry daily, processes weekly. The form at
<https://www.pulsemcp.com/submit> is a fallback, not the path: it asks only
whether you are submitting a server or a client, and for one URL. Corrections
to an existing listing go to `hello@pulsemcp.com`, not through the form.

Check for the listing before submitting one.

## Forms only the maintainer can file

Each of these needs a browser session and an account. None of them can be
driven from this repository.

### Claude Code community marketplace

The old link, `clau.de/plugin-directory-submission`, now 302s to the plugins
documentation rather than to a form. Two things it corrects:

- Submissions land in **`anthropics/claude-plugins-community`**, installed by
  users as `@claude-community`. They do not land in
  `claude-plugins-official`, which Anthropic curates at its own discretion
  with no application process at all.
- There are two forms, and which one applies depends on the account.
  <https://claude.ai/admin-settings/directory/submissions/plugins/new> needs a
  Team or Enterprise organisation with directory management access. Individual
  authors use the Console instead:
  <https://platform.claude.com/plugins/submit>.

Run `claude plugin validate ./plugins/workfile` first. The review pipeline runs
the same check, alongside automated safety screening. It found real defects the
first time it was run here — see [[T-0134]] — and passes now.

After approval the plugin is pinned to a commit SHA in the community catalog
and CI bumps the pin as the repository moves. The public catalog syncs
nightly, so absence right after approval is expected rather than a problem.

### mcpservers.org — `wong2/awesome-mcp-servers`

- Form: <https://mcpservers.org/submit>
- Reads like a pull request target and is not one. The README says so in its
  second line, and the repository has pull requests and issues both disabled:
  `GET /repos/wong2/awesome-mcp-servers/pulls` returns 404, and `gh pr create`
  fails with a permissions error that never names the cause.
- Fields, all required: Server Name, Short Description, Link (GitHub or docs),
  Category, Contact Email. Category is a fixed dropdown — `Productivity`,
  `Development` and `Memory` are the three that fit.
- The "Premium Submit" checkbox carries a $39 one-time fee and is not required.

## Charges for a listing

### mcp.so

Submission at <https://mcp.so/submit?type=server> is paid. That is the whole
entry: the listing was only ever reach rather than signal, and reach is the
wrong side of a price when every other registry here is free.

The site answers automated requests with HTTP 403, so this was established by
opening the form rather than by fetching it.

### Smithery — `smithery.ai`

Dropped, and the cost is an artifact rather than money. It takes a local stdio
server only as an `.mcpb` bundle, which nothing here builds. That is a format
to produce, version and keep working in exchange for one listing.

Its other route is a public HTTPS endpoint entered at
<https://smithery.ai/new>, which does not describe this server. Reopen the
question if the bundle becomes worth having for its own sake, not for the
listing.

## Pull requests

One line each, and they keep returning traffic long after a launch post stops:

- `punkpeye/awesome-mcp-servers`
- awesome lists for Claude Code plugins and AI agent tooling

Check where a list accepts submissions before preparing one. A CONTRIBUTING
file describes the format; it does not promise the repository is the intake
channel, and one of the two largest lists is a website form wearing a README.

Then read the rules, and then read the file — they disagree. `punkpeye`
documents alphabetical order within a category and maintains none, appending
instead, so appending is what merges cleanly. Its CONTRIBUTING also
fast-tracks pull requests from automated agents whose title ends in three
robot emoji.

Its bots then check the submission and label it: `valid-name`, `has-emoji`,
`has-glama`. The Glama one comes with a request to make sure the server has
actually been scored, which a badge alone does not achieve. Embedding the
badge is a promise to go and claim the listing — cheap, per the section above.
Scoring is the part that is not cheap, so expect the badge to render its grades
with the quality slot still empty, and only embed it once the other slots say
something.

## The copy to reuse

Keeping these identical across submissions is what makes the listings look
like one project rather than four.

- **Name**: Workfile — package `@illodev/workfile`, MCP server
  `io.github.illodev/workfile`
- **One line**: The repository is the database.
- **Description**: Repository-native protocol and local MCP server for Work,
  Docs, History and durable project Memory. (99 characters, which is the MCP
  Registry's limit — do not extend it without checking.)
- **Repository**: <https://github.com/illodev/workfile>
- **Demo**: <https://workfiledemo.illodev.com>
- **License**: MIT
- **Category**: productivity
- **Install**: `npx -y @illodev/workfile mcp` — the invocation the registry
  itself advertises, and the one to quote wherever a form asks for a command.

## The example use cases

The Claude Code marketplace form requires these and no other registry has asked
yet. They are here so the next one that asks gets the same four rather than a
fresh improvisation.

> **Ejemplo 1:** Two agents work the same repository at once. Each claims its
> card with a scope of paths before editing — `/claim T-0042 src/auth` — and
> the second is refused when it tries to take work the first already holds,
> instead of both editing the same files and one silently winning.
>
> **Ejemplo 2:** A session ends, context is compacted, a new session starts.
> Asking "what did we decide about the release pipeline, and why?" is answered
> from decisions and learnings committed in the repository, so the reasoning
> survives instead of being re-derived from the diff.
>
> **Ejemplo 3:** Closing work with `/done` runs the project doctor, writes a
> changelog fragment while the change is still fresh, and moves the card to
> `review`. `review` means the code is written; `done` requires runtime
> evidence — a test that passed, a command whose output you saw — not a merge.
>
> **Ejemplo 4:** `/context T-0042` loads the relevant slice of the project —
> the card, its relations, the active conventions and any open incident —
> instead of reading the whole repository into the window to answer one
> question.

The first two are the ones that separate Workfile from a task list with an MCP
server in front of it. Cut from the bottom if a form is strict about length.

## What a listing costs

Worth stating plainly, because it decided two of these. Free and
machine-verified is the best kind and there is exactly one: the official
registry. Free and human-reviewed is worth the wait. A listing that costs an
artifact to maintain, or money, has to earn it against reach nobody has
measured yet — and PulseMCP is the only registry here that reports back
whether a listing did anything at all.
