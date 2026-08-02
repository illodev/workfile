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
stays the reference: requirements, copy, and order.

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

Downstream registries mirror this one. Listing here is what eventually feeds
the aggregators below, so it is the only entry that compounds.

## Indexed without asking

### Glama — `glama.ai/mcp/servers`

Crawls public GitHub repositories and indexes every tool and schema it finds.
No submission. The listing quality tracks the repository README and the tool
descriptions the server already returns, so it improves when those do.

Its score badge resolves for any repository path, filled in once the crawler
arrives — so a listing that embeds the badge is never broken, only unscored.

## Forms only the maintainer can file

Each of these needs a browser session and an account. None of them can be
driven from this repository.

### Anthropic plugin directory

- Form: <https://clau.de/plugin-directory-submission>
- Directory: `anthropics/claude-plugins-official`
- Needs: a public marketplace with `.claude-plugin/marketplace.json`, and a
  plugin that meets Anthropic's quality and security review.
- This repository is already a marketplace. The entry carries `displayName`,
  `category` and `keywords` because the directory sorts on them.
- The only one with a review queue behind it, so the one where waiting costs
  the most. File it first.

### mcpservers.org — `wong2/awesome-mcp-servers`

- Form: <https://mcpservers.org/submit>
- Reads like a pull request target and is not one. The README says so in its
  second line, and the repository has pull requests and issues both disabled:
  `GET /repos/wong2/awesome-mcp-servers/pulls` returns 404, and `gh pr create`
  fails with a permissions error that never names the real cause.

### mcp.so

- Submit button on the site, or an issue on their GitHub repository.
- Needs: repository URL and a description. The server.json listing is the
  stronger signal; this one is reach.

### PulseMCP — `pulsemcp.com`

- Submit button in the site navigation.
- Needs: repository URL, description, category. Publishes an estimated weekly
  visitor count per server, which makes it the only one of these that reports
  back whether the listing did anything.

### Smithery — `smithery.ai`

- Needs: a publisher account and a manifest naming the server, its tools and
  its auth method. Costs an account, not a secret.

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
- **License**: MIT
- **Category**: productivity
- **Install**: `npx -y @illodev/workfile mcp` — the invocation the registry
  itself advertises, and the one to quote wherever a form asks for a command.

## Order of operations

The MCP Registry entry only exists once a tag ships it, because it names a
version npm must already serve. `v0.4.0` was that tag, so the entry is live
and every submission below it can be filed now — several of them ask for it.
