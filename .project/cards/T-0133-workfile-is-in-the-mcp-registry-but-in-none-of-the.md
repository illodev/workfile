---
id: T-0133
title: Workfile is in the MCP Registry but in none of the directories that mirror it
status: next
type: task
priority: medium
area: infra
created: 2026-08-02
updated: 2026-08-02
---

[[T-0114]] shipped the half a repository can own: `v0.4.0` published
`server.json` from CI and `io.github.illodev/workfile` is active in the
official MCP Registry. That entry is the one that compounds, because the
aggregators mirror it — but mirroring is not immediate and most of them index
from their own submission queue, not from the registry.

So Workfile is discoverable by name and by nothing else. Everything left is a
browser session with an account behind it, which is why none of it can be
wired into `release.yml` the way the registry step was.

[[DOC-0004]] holds the requirements per registry and the copy to reuse. This
card holds the state: what is filed, what is drafted, what is still open.

## The two pull requests

Both lists take one line and reject on format alone, so the lines are recorded
here rather than left in a working copy. Read against the live READMEs before
filing — they move daily.

`punkpeye/awesome-mcp-servers`, appended to **Product Management** (the
category is append-ordered in practice, whatever CONTRIBUTING says about
alphabetical order). Their CONTRIBUTING fast-tracks agent PRs whose title ends
in three robot emoji:

```
- [illodev/workfile](https://github.com/illodev/workfile) [![illodev/workfile MCP server](https://glama.ai/mcp/servers/illodev/workfile/badges/score.svg)](https://glama.ai/mcp/servers/illodev/workfile) 🎖️ 📇 🏠 🍎 🪟 🐧 - Work, Docs, History and durable Memory as Markdown inside the repository, so the backlog reviews, branches and merges with the code that answers it. Cards carry a lifecycle and a claim, so parallel agents refuse to edit a card another actor holds. 30 tools, plus a CLI, a Claude Code plugin and a local UI. `npx -y @illodev/workfile mcp`
```

`wong2/awesome-mcp-servers`, **Community Servers**, which really is
alphabetical — between `Windsor` and `X (Twitter)`:

```
- **[Workfile](https://github.com/illodev/workfile)** - Work, Docs, History and Memory as Markdown in the repository. Cards carry a lifecycle and a claim, so parallel coding agents refuse to take work another one already holds.
```

The Glama badge in the first line renders today: Glama generates a score badge
for any repository path and fills in the score once its crawler reaches the
repository. It does not need a submission, so nothing here waits on it.

## Acceptance criteria

- [ ] `punkpeye/awesome-mcp-servers` lists Workfile
- [ ] `wong2/awesome-mcp-servers` lists Workfile
- [ ] The Anthropic plugin directory submission is filed
- [ ] mcp.so, PulseMCP and Smithery each list the server
- [ ] Glama shows a real score rather than a placeholder, confirming it crawled
