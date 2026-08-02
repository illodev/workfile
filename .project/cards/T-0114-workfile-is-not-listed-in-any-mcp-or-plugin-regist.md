---
id: T-0114
title: Workfile is not listed in any MCP or plugin registry
status: done
type: task
priority: medium
area: infra
created: 2026-08-02
updated: 2026-08-02
scope: [scripts/sync-workspace-versions.ts, packages/workfile/strict-baseline.json]
---
Workfile ships an MCP server, a Claude Code plugin and an npm package, and is
discoverable through none of the places people look for those. The package is
on npm and the plugin marketplace lives in this repository, but both require
already knowing the name. Every registry below indexes by capability instead.

The registries split by what they cost:

- **Machine-verified**, and therefore something this repository can own: the
  official MCP Registry publishes from CI and proves ownership from the
  artifacts themselves.
- **Form-submitted**, and therefore the maintainer's to file once: Anthropic's
  plugin directory, mcp.so, PulseMCP, Smithery.
- **Automatic**: Glama indexes public GitHub repositories on its own.

Only the first belongs in the release pipeline. The rest are one-time
submissions that no amount of repository configuration can automate.

## The fix

The official MCP Registry hosts metadata only, and verifies that the metadata
matches the artifact. That takes three things here: an `mcpName` in the
published `package.json`, a `server.json` naming the same server, and a
publish step after the npm one — the registry rejects a version that is not on
npm yet.

Authentication is the part that decides the shape. `mcp-publisher login
github-oidc` reuses the `id-token: write` permission `release.yml` already
holds for npm trusted publishing, so the namespace `io.github.illodev/` costs
no stored secret. A custom `com.illodev/` namespace would need an Ed25519
private key in repository secrets, which is a worse trade for a nicer string —
the same trade [[T-0107]] refused.

`server.json` carries the version twice, so it drifts the way workspace
manifests would without `sync-workspace-versions.ts`. It goes into that
script rather than into a second one.

## Acceptance criteria

- [x] `mcpName` and `server.json` agree, and both track the released version
- [x] The release workflow publishes to the MCP Registry without a new secret
- [x] Version drift between `server.json` and the root is a check failure
- [x] The form submissions are written down somewhere the maintainer can file
      them without rediscovering each registry's requirements

## Notes

- 2026-08-02 17:13Z illodev@local#bd44efc7 — The machine-verifiable half is in place and validated against the live registry; the form submissions are written down in [[DOC-0004]].

Evidence:

    mcp-publisher validate   --> "server.json is valid" (checked against
                                 registry.modelcontextprotocol.io, not a
                                 local copy of the schema)
    sync-workspace-versions  --> drift injected into both version fields is
                                 reported by --check and repaired by the
                                 plain run; round-trip returns to 0.3.0
    pnpm test                --> 228 + 7 pass, 0 fail
    pnpm workfile doctor     --> 0 errors, 0 warnings

Two things the schema pinned down. `description` has a hard 100-character
limit and the package description is 99, so it fits unchanged but has no room
left — worth knowing before someone improves the wording. And the argument
list had to be verified rather than assumed: `workfile mcp --root X` works
because `positional()` reads argv[3] strictly and rejects anything starting
with a dash, so the flag is never mistaken for the subcommand.

Left in review, not done: the release workflow step has never executed. The
registry entry exists only once a `v*` tag runs it, and nothing before that
proves the OIDC login is accepted for the io.github.illodev namespace. The
first release after this lands is the verification.
- 2026-08-02 17:19Z illodev@local#bd44efc7 — Reopened briefly: I called this reviewed after `pnpm test` and `doctor`, without running `pnpm run check`. The strict ratchet was red — `drift.push()` in the sync script added a fourth error to a file whose baseline allowed three, because `const drift = []` infers `never[]`.

Typed rather than silenced: `drift: string[]` and `entries: Dirent[]`, which takes the file from 3 known errors to 0 and drops it out of the baseline entirely. The ratchet counts an improvement as a failure until re-recorded, so the baseline is one line shorter and nothing else moved.

`pnpm run check` is green now: 228 + 7 tests, strict held at 590 known errors across 57 files. Still review, for the reason already recorded — no tag has run the publish step.
- 2026-08-02 20:37Z illodev@local#aed59c5e — Verified against the 0.4.0 release rather than against a staging call — this
was the first release that could exercise it.

Run 30765771544, on tag v0.4.0:

- `Publish to npm: success`, then `Publish to the MCP Registry: success`. The
  order matters and held: the registry refuses a version npm does not serve.
- No secret was added. `mcp-publisher login github-oidc` reused the
  `id-token: write` permission trusted publishing already required.

Against the published artifact rather than the repository:

    npm view @illodev/workfile@0.4.0 mcpName  →  io.github.illodev/workfile
    registry.modelcontextprotocol.io          →  io.github.illodev/workfile
                                                 version 0.4.0
                                                 packages[0] @illodev/workfile@0.4.0

So `mcpName`, `server.json` and the live listing all name the same server and
track the released version.

The third criterion was the one the release could not prove — a green run shows
the check runs, not that it catches. Proven separately against a throwaway
repository with a root at 9.9.9 and a `server.json` at 0.0.1:

    exit 1 — "server.json is 0.0.1, root is 9.9.9"

One hole found while proving it, and it is not this card's to fix: the script
resolves `packages/` first and `process.exit(0)` in the catch, so a repository
without that directory skips the `server.json` check entirely and drift passes
at exit 0. Latent here, since `packages/` always exists — but the guard runs
only because an unrelated readdir happened to succeed, which is the shape
[[LRN-0012]] records. Added to [[T-0132]], the card that already owns a change
to this function.

## Activity

- 2026-08-02 17:13Z illodev@local#bd44efc7 · doing → review
- 2026-08-02 17:16Z illodev@local#bd44efc7 · claimed
- 2026-08-02 17:19Z illodev@local#bd44efc7 · released
- 2026-08-02 17:19Z illodev@local#bd44efc7 · next → review
- 2026-08-02 20:36Z illodev@local#aed59c5e · claimed
- 2026-08-02 20:37Z illodev@local#aed59c5e · doing → done

