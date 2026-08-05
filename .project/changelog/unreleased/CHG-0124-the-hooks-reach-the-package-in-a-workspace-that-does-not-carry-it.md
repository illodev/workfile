---
id: CHG-0124
title: The hooks reach the package in a workspace that does not carry it
type: fixed
area: mcp
visibility: public
created: 2026-08-05
updated: 2026-08-05
cards: [T-0178]
---
`.mcp.json` gained a portable form in 0.6.0 and the hooks did not. Their only
spelling was `node node_modules/@illodev/workfile/…/hooks.mjs`, so in a
workspace that only ever used the global binary — the one `npx` exists for —
the MCP server started and all three hooks named a file that is not there. A
hook that cannot run exits `0` in silence, which is indistinguishable from one
that works.

The package now publishes a `workfile-hooks` bin, and a workspace with no local
install gets that instead. Which form is written follows the same question
`.mcp.json` asks, asked once and answered for both, so the server and the hooks
cannot name different copies of the package.

`npx` was the obvious candidate and is not the answer. Measured per invocation
with the cache already warm:

```
  bare node spawn (floor)                p50   20ms
  node node_modules/…/hooks.mjs          p50   25ms
  workfile-hooks (bin, through PATH)     p50   26ms
  npx -y @illodev/workfile               p50 1663ms
```

`PreToolUse` runs before every call it matches and `PostToolUse` matches
everything, so 1.6 s per invocation is not a slower hook, it is a different
product. The bin costs one millisecond over the relative path because it is the
same script: the runtime imports nothing from the package, so PATH resolution is
all that is added. An absolute path resolved at install time was the other
candidate and is worse than either — `.claude/settings.json` is committed, so it
would put one machine's home directory into everyone else's checkout.

`claude check` now resolves the command rather than assuming it, and reports it
beside the files rather than among them: a settings file can say exactly what an
install would write and still name a hook that is not there. It is a warning,
not an error, because whether a bin is on `PATH` is true on one machine and
false on another — and the pre-commit hook runs `doctor --severity error`.
