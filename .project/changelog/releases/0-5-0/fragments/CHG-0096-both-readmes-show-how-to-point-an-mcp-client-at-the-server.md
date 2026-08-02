---
id: CHG-0096
title: Both READMEs show how to point an MCP client at the server
type: added
area: docs
visibility: public
created: 2026-08-02
updated: 2026-08-02
cards: [T-0139]
---
`server.json` tells every MCP client to run `npx -y @illodev/workfile mcp`,
and that string appeared in neither README. The MCP section showed
`workfile mcp`, which resolves only once the package is installed, and the
install section leads with a devDependency — the right first command for the
repository this manages, and the wrong one for someone who arrived from a
registry wanting to point a client at a server.

Both READMEs now carry the client configuration, ahead of the commands that
need an install. Registries render the repository README rather than the copy
submitted with a listing, so this is what a directory shows.

A test compares the invocation across all four places that state it — the two
READMEs, `server.json` and the generated `.mcp.json` — so they cannot drift
apart quietly.
