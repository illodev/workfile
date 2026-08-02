---
id: DOC-0004
title: "Registry listings: what each one needs and who can file it"
kind: reference
status: current
created: 2026-08-02
updated: 2026-08-02
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
read off the live form, except where it says otherwise.

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

### Glama — `glama.ai/mcp/servers`

Crawls public GitHub repositories and indexes every tool and schema it finds.
No submission. The listing quality tracks the repository README and the tool
descriptions the server already returns, so it improves when those do.

Its score badge resolves for any repository path, filled in once the crawler
arrives — so a listing that embeds the badge is never broken, only unscored.

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
the same check, alongside automated safety screening. As of writing it **fails**
— see [[T-0134]] — so this submission is blocked until that card closes.

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
- There is an optional "Premium Submit" checkbox carrying a $39 one-time fee.
  Nothing requires it.

### Smithery — `smithery.ai`

Takes a local stdio server, contrary to the earlier note here that it needed a
hosted one. Two routes, and only the second applies to Workfile:

- A public HTTPS endpoint, entered at <https://smithery.ai/new>.
- An `.mcpb` bundle for servers that run locally, uploaded through the site or
  with `smithery mcp publish ./server.mcpb -n illodev/workfile`.

The current documentation names no required `smithery.yaml`. A
`/.well-known/mcp/server-card.json` is offered as optional metadata for when
automatic scanning fails.

Building the `.mcpb` is work this repository does not do yet. It has no card;
file one before starting rather than folding it into a submission.

### mcp.so

- Submit button on the site, or an issue on their GitHub repository.
- Unverified: the site answers automated requests with HTTP 403, so the field
  list here is the only one not read off the live form. Confirm in a browser.

## Pull requests

One line each, and they keep returning traffic long after a launch post stops:

- `punkpeye/awesome-mcp-servers`
- awesome lists for Claude Code plugins and AI agent tooling

Check where a list accepts submissions before preparing one. A CONTRIBUTING
file describes the format; it does not promise the repository is the intake
channel, and the largest of these lists is a website form wearing a README.

Then read the rules, and then read the file — they disagree. `punkpeye`
documents alphabetical order within a category and maintains none, appending
instead, so appending is what merges cleanly. Its CONTRIBUTING also
fast-tracks pull requests from automated agents whose title ends in three
robot emoji. The drafted lines live on [[T-0133]].

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
- **Contact**: the address on the npm package
- **License**: MIT
- **Category**: productivity
- **Install**: `npx -y @illodev/workfile mcp` — the invocation the registry
  itself advertises, and the one to quote wherever a form asks for a command.

## Order of operations

The MCP Registry entry only exists once a tag ships it, because it names a
version npm must already serve. `v0.4.0` was that tag, so the entry is live
and everything downstream of it can proceed.

1. Close [[T-0134]]. It blocks the Claude Code submission and nothing else
   waits on it.
2. File the Claude Code community marketplace form. It is the only one with a
   review queue behind it, so it is where waiting costs the most.
3. File mcpservers.org and mcp.so.
4. Check Glama and PulseMCP rather than filing: both arrive on their own.
5. Smithery last, once something builds the `.mcpb`.
