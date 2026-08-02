---
id: T-0133
title: Workfile is in the MCP Registry but in none of the directories that mirror it
status: next
type: task
priority: medium
area: infra
created: 2026-08-02
updated: 2026-08-02
scope: [.project/cards, .project/docs]
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

## The one pull request

Only `punkpeye/awesome-mcp-servers` takes a pull request. It is open as
[#11406](https://github.com/punkpeye/awesome-mcp-servers/pull/11406), one line
appended to **Product Management** — the category is append-ordered in
practice, whatever CONTRIBUTING says about alphabetical order. Their
CONTRIBUTING fast-tracks pull requests from automated agents whose title ends
in three robot emoji, which this one does.

The line, recorded here because the list rejects on format alone and the
working copy that produced it is disposable:

```
- [illodev/workfile](https://github.com/illodev/workfile) [![illodev/workfile MCP server](https://glama.ai/mcp/servers/illodev/workfile/badges/score.svg)](https://glama.ai/mcp/servers/illodev/workfile) 🎖️ 📇 🏠 🍎 🪟 🐧 - Work, Docs, History and durable Memory as Markdown inside the repository, so the backlog reviews, branches and merges with the code that answers it. Cards carry a lifecycle and a claim, so parallel agents refuse to edit a card another actor holds. 30 tools, plus a CLI, a Claude Code plugin and a local UI. `npx -y @illodev/workfile mcp`
```

The Glama badge in that line renders today: Glama generates a score badge for
any repository path and fills in the score once its crawler reaches the
repository. It does not need a submission, so nothing here waits on it.

`wong2/awesome-mcp-servers` is not a pull request and never was — its README
says so in its second line, and the repository has pull requests and issues
both disabled. It intakes at <https://mcpservers.org/submit>, so it belongs
with the forms below. Its line, should the form ask for one:

```
- **[Workfile](https://github.com/illodev/workfile)** - Work, Docs, History and Memory as Markdown in the repository. Cards carry a lifecycle and a claim, so parallel coding agents refuse to take work another one already holds.
```

## The forms

Each needs a browser session and an account, and the copy to paste is in
[[DOC-0004]]. Ordered by how much waiting costs:

1. **Anthropic plugin directory** — <https://clau.de/plugin-directory-submission>.
   The only one with a review queue behind it.
2. **mcpservers.org** — <https://mcpservers.org/submit>.
3. **mcp.so**, **PulseMCP**, **Smithery**.

## Acceptance criteria

- [ ] `punkpeye/awesome-mcp-servers` lists Workfile
- [ ] `mcpservers.org` lists Workfile
- [ ] The Anthropic plugin directory submission is filed
- [ ] mcp.so, PulseMCP and Smithery each list the server
- [ ] Glama shows a real score rather than a placeholder, confirming it crawled

## Activity

- 2026-08-02 21:11Z illodev@local#bd44efc7 · claimed
- 2026-08-02 21:12Z illodev@local#bd44efc7 · released

## Notes

- 2026-08-02 21:12Z illodev@local#bd44efc7 — punkpeye is open as #11406 (+1/-0, MERGEABLE), filed from a fork of the current upstream HEAD with the agent fast-track title.

wong2 cost a wasted branch. I read its entry format off the file and its ordering off the surrounding lines, and never read the top of its README — which says, in its second line, "We do not accept PRs. Please submit your MCP on the website". The repository confirms it: `GET /repos/wong2/awesome-mcp-servers/pulls` 404s and `has_issues` is false, so `gh pr create` failed with a permissions error that never mentions the real cause. The branch pushed to the fork was deleted; the line survives in the body above.

The general shape, for the remaining registries: a list's contributing rules describe the format, not the intake channel. Check where submissions are accepted before preparing one.
