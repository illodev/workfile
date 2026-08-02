---
id: T-0139
title: The README never shows the invocation the MCP Registry advertises
status: next
type: docs
priority: medium
area: docs
created: 2026-08-02
updated: 2026-08-02
---

`server.json` tells every MCP client to run `npx -y @illodev/workfile mcp`,
and that string appears nowhere in the README. The MCP section shows
`workfile mcp`, which only resolves once the package is installed, and the
Install section leads with `pnpm add -D @illodev/workfile` and treats `npx` as
a one-off to warn about rather than a way to run the server.

That ordering is right for the product — Workfile is a devDependency of the
repository it manages, and the `project*` scripts depend on it being one. It
is wrong for the visitor a registry sends. Someone browsing an MCP directory
wants to point a client at a server; being told to add a devDependency first
is an answer to a question they have not asked yet.

The mcpservers.org listing made this visible, because it renders this
README rather than the copy submitted with it: the install block a reader
sees there is `pnpm add -D`. Glama does the same, and so will any aggregator
that mirrors a repository. The README is the shop window whether or not it was
written as one.

## The fix

Not a reordering. The install story is correct as it stands and the two
audiences want different first commands, so the MCP section should carry the
exact string `server.json` publishes, next to the client configuration it goes
with. A reader arriving from a registry lands in that section, not at the top.

Worth checking at the same time that the string is not written twice by hand.
`claudeMcpFile` already generates the argument list for `.mcp.json`, and
`server.json` states it a third time — a README example is a fourth copy of
something three places already assert, which is the shape [[LRN-0011]] records.

## Acceptance criteria

- [ ] The README shows `npx -y @illodev/workfile mcp` where a reader arriving
      from a registry would look
- [ ] The invocation in the README, `server.json` and the generated
      `.mcp.json` cannot disagree without something failing
