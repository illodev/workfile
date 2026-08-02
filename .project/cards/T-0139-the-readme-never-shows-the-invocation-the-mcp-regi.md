---
id: T-0139
title: The README never shows the invocation the MCP Registry advertises
status: done
type: docs
priority: medium
area: docs
created: 2026-08-02
updated: 2026-08-02
scope: [packages/workfile/test, .project/cards]
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

- [x] The README shows `npx -y @illodev/workfile mcp` where a reader arriving
      from a registry would look
- [x] The invocation in the README, `server.json` and the generated
      `.mcp.json` cannot disagree without something failing

## Activity

- 2026-08-02 22:34Z illodev@local#bd44efc7 · claimed
- 2026-08-02 22:39Z illodev@local#bd44efc7 · doing → done
- 2026-08-02 22:48Z illodev@local#bd44efc7 · claimed
- 2026-08-02 22:51Z illodev@local#bd44efc7 · doing → done

## Notes

- 2026-08-02 22:39Z illodev@local#bd44efc7 — Both READMEs now carry the client configuration ahead of the commands that need an install. The npm one got it too: it is a second landing page, and its only MCP line was `npx workfile mcp`, which works after the install block above it and not before.

The second criterion was the real work. Four places state this invocation and one is generated, so the test compares them: both READMEs against `claudeMcpFile()`, and `server.json`'s npm identifier and positional argument against the generated args.

Proven red before green, per [[LRN-0011]], once per source:

    README args -> "workfile-mcp"        --> "README.md and claudeMcpFile disagree
                                             about how to start the server"
    server.json positional -> "serve"    --> expected 'serve', actual 'mcp'
    server.json identifier -> a new name --> "server.json publishes
                                             @illodev/workfile-mcp, the generated
                                             args do not name it"

The first of those is [[T-0116]] reintroduced verbatim — the `workfile-mcp` bin npx cannot select from a package spec, which shipped a server that answered every request with the CLI help on stdout. Nothing compared the copies then. Something does now.

    pnpm run check   --> 252 + 7 pass, strict 588, none new
    doctor           --> 0 errors, 0 warnings

One thing deliberately not asserted: the README snippet omits `env: {}`, which the generated file carries and which would be noise in something people copy. The test compares command and args, the two fields a client acts on, rather than demanding the snippet be byte-identical to a generated file it is not.
- 2026-08-02 22:51Z illodev@local#bd44efc7 — Reopened: the test I added to hold the four copies together could not run on Windows. The regex matched the fence on a bare \`\n\` and the runner checks the repository out with CRLF, so it found nothing and reported the README as stating no configuration at all — green on Linux and macOS, red on both Windows matrices.

Reproduced locally rather than guessed, by converting both READMEs to CRLF:

    old test, CRLF files   --> not ok, "README.md states no MCP client configuration"
    new test, CRLF files   --> 7 pass, 0 fail
    READMEs restored       --> git diff empty, byte for byte

The content is normalized on read instead of the pattern being loosened, because the same file is then parsed and compared and neither wants stray carriage returns either.

Worth stating plainly: this is the failure mode this repository already knows about — a test that passes locally and only fails where the line endings are not the ones it was written with. It reached main because CI runs on the pushed head and I had verified on Linux alone.

    pnpm run check   --> 252 + 7 pass, strict 588, none new
    doctor           --> 0 errors, 0 warnings

The same CI run failed a second test that is not this one and not flakiness: concurrent card creation died with EPERM on a lock file. Filed as [[T-0140]].
