---
id: CHG-0106
title: The MCP guide states the registration the install actually writes
type: fixed
area: mcp
visibility: public
cards: [T-0153]
created: 2026-08-04
updated: 2026-08-04
---

`docs/mcp.md` described what `workfile claude install` writes into `.mcp.json`
as "Registers `workfile-mcp` — the binary that parses its own flags". It has
not registered that since 0.4.0. T-0116 moved it to `npx -y @illodev/workfile
mcp`, because `npx` cannot select a named bin from a package spec: registering
the bin started the CLI instead of the server, and every request came back as
the help text on stdout.

The sentence survived because it is half true. The `workfile-mcp` bin exists,
it does parse its own flags, and `workfile mcp config` emits it for hosts that
build a configuration themselves — so a reread confirms the words rather than
the claim.

T-0116 left a check comparing the generated configuration against every stated
copy, written because three hand-written copies had already drifted. It reads
fenced JSON blocks, and this fourth copy was prose in a table cell, so it was
never in the comparison. `mcp.md` now states the configuration as a block like
the READMEs do and the existing check covers it — one fewer copy pinned by a
weaker rule, rather than one more rule.
