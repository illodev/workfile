---
id: T-0116
title: The marketplace plugin registers an MCP server that never starts
status: done
type: bug
priority: high
area: mcp
created: 2026-08-02
updated: 2026-08-02
scope: [plugins/workfile/.mcp.json, scripts/build-plugin.ts, packages/workfile/src/modules/claude, packages/workfile/test/claude-surface.test.ts]
---
`plugins/workfile/.mcp.json` registered the server as:

```
npx -y @illodev/workfile workfile-mcp --root ${CLAUDE_PROJECT_DIR}
```

npx resolves the bin whose name matches the package — `workfile` — and hands
everything after the package spec to it as arguments. So that line runs
`workfile workfile-mcp --root ...`, which is not a command: the CLI prints its
general help to **stdout** and exits 2. A client reading stdout for JSON-RPC
gets `Workfile\n\nUsage:` where the initialize response should be.

Every install from the marketplace has had a dead MCP server. The slash
commands and hooks worked, which is what made it survive — the plugin looked
installed and only the tools were missing.

Confirmed against the published package, not against a checkout:

```
$ npx -y @illodev/workfile@0.3.0 workfile-mcp --root <repo>
Workfile

Usage:
  workfile init [--root PATH] ...
[exit 2]
```

## Why it survived

Two guards were already in place and neither could see it.

`surface.ts` carries a comment explaining this exact trap, and
`claude-surface.test.ts` asserts the generated `.mcp.json` uses the `mcp`
subcommand. Both cover the file `project claude install` writes into a
consuming repository. The plugin ships its **own** copy, and that copy was
hand-maintained — the same failure `build-plugin.ts` documents for the hook
wiring, which shipped corrected matchers to everyone except marketplace
users.

The plugin copy was tested, but only for the placeholder:

```js
assert.ok(mcp.mcpServers["workfile"].args.includes("${CLAUDE_PROJECT_DIR}"))
```

The broken args contained `${CLAUDE_PROJECT_DIR}`, so the assertion passed on
every run.

## Acceptance criteria

- [x] The plugin's `.mcp.json` is generated, not hand-maintained
- [x] The generated registration completes an MCP handshake when launched
      from an unrelated working directory
- [x] The test compares against the generator and fails when the old form is
      restored

## Notes

- 2026-08-02 17:19Z illodev@local#bd44efc7 — Fixed at the source rather than in the file: `mcpConfiguration()` is now the exported, parameterised `claudeMcpFile(root)`, `build-plugin.ts` writes the plugin's `.mcp.json` from it, and the hand-maintained copy is gone. Same shape as `claudeHooksFile(PLUGIN_HOOK_RUNTIME)`, for the same reason.

`--root` is safe to append to the subcommand, and this was verified rather
than assumed: `positional()` reads argv[3] strictly and returns undefined for
anything starting with a dash, so `mcp --root X` starts the server instead of
looking up a subcommand named `--root`.

Evidence, driving the registration exactly as a host would — placeholder
substituted, launched from an unrelated working directory so only `--root`
could find the workspace, against the **published** 0.3.0 rather than this
checkout:

    npx -y @illodev/workfile mcp --root <repo>
    --> initialize ok: workfile 0.3.0 protocol=2025-11-25
    --> tools/list ok: 30 tools

The old form under the same probe answers with the CLI help text on stdout and
exits 2.

The test now compares the packaged file byte for byte against the generator.
Restoring the broken args fails it:

    not ok 5 - the distributable plugin cannot drift from the generated surface
      run `node scripts/build-plugin.ts`: the packaged MCP registration is stale

Full pipeline after the fix: `pnpm run check` green — 228 + 7 tests, strict
held at 590 known errors across 57 files, none new.

Done rather than review: the fix needs no release. It works against the
package already on npm, so anyone who reinstalls the plugin from this
marketplace gets a working server today.

## Activity

- 2026-08-02 17:19Z illodev@local#bd44efc7 · doing → done
