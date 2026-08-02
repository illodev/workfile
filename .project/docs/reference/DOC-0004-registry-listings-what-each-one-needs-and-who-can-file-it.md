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

## Published from CI

### Official MCP Registry — `registry.modelcontextprotocol.io`

Wired into `.github/workflows/release.yml`. A `v*` tag publishes the packages
to npm, then `mcp-publisher` publishes `server.json`.

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

The awesome lists take a one-line PR each and keep returning traffic long
after a launch post stops:

- `punkpeye/awesome-mcp-servers`
- `wong2/awesome-mcp-servers`
- awesome lists for Claude Code plugins and AI agent tooling

Read each list's contributing rules first: most enforce alphabetical order
within a category and a fixed one-line format, and reject on that alone.

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

## Order of operations

The MCP Registry entry only exists once a tag ships it, because it names a
version npm must already serve. So the first release after this work lands is
what creates the listing, and the form submissions are worth filing after it —
several of them ask for the registry entry.
