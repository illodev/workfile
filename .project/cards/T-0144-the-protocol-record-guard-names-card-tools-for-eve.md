---
id: T-0144
title: The protocol-record guard names card tools for every record type
status: done
type: bug
priority: high
area: core
created: 2026-08-03
updated: 2026-08-03
scope: [packages/workfile/src/runtime/claude/hooks.mjs, packages/workfile/test/claude-surface.test.ts, plugins/workfile/runtime/hooks.mjs]
---
The `PreToolUse` guard asks before any `Edit`/`Write` to a `.md` under the
protocol root, which is correct: the write would skip the lock, the revision
check and validation. What it said while asking was not.

    <path> is a protocol record. Use the project CLI or MCP tools
    (project_card_patch, project_card_write, project_card_note) so the write
    takes a lock and checks the revision.

The same three card tools for every record type. An agent writing
`.project/docs/features/AMPLIACION-DOC-0163-....md` was handed three tools that
cannot open a doc, found nothing that fit, and reached for `Edit` again — so
the guard asked again.

Nothing the user can switch off ends that loop. A hook's `ask` outranks
`bypassPermissions` by design, which T-0099 already established, so the
symptom presents as the permission mode being broken rather than as a guard
doing its job. Reported from a session in another repository consuming the
published package, running with bypass on.

`.project/agents/**` was the worst case: generated and digest-stamped, so no
record tool opens it at all and a hand edit survives only until the next
`agents sync` reverts it.

## The fix

Route on the first segment under the protocol root. Cards, docs, memory and
changelog each name their own tools plus the CLI noun; `agents` is sent to
`agents sync`; anything else keeps the generic wording without inventing a tool
name it cannot know.

The table is hardcoded because the runtime imports nothing from the package on
purpose — the latency budget depends on it — so a test pins every name the
guard can emit against `listMcpTools()`. Naming a tool that was since renamed
is the original dead end with extra steps.

Known limit: the segment names are the `config/defaults.ts` layout, so a
project that moves `cards.path` gets the generic fallback. That is the same
assumption `buildBoard` already makes one function above.

## Acceptance criteria

- [x] Each record type's reason names a tool that opens that record
- [x] No record but a card is pointed at a card tool
- [x] The generated agent surface is sent to `agents sync`, not to a record tool
- [x] Every tool name the guard can emit exists in the MCP registry

## Activity

- 2026-08-03 19:15Z illodev@local#2ba09e5f · claimed
- 2026-08-03 19:23Z illodev@local#2ba09e5f · doing → review
- 2026-08-03 19:36Z illodev@local#2ba09e5f · review → done

## Notes

- 2026-08-03 19:22Z illodev@local#2ba09e5f — Runtime evidence, against the built runtime the session actually loads. Driving dist/src/runtime/claude/hooks.mjs with a real PreToolUse payload for each shape returns: cards -> project_card_patch/write/note + `workfile card patch`; docs -> project_doc_patch/create/move + `workfile doc patch`; memory -> project_memory_patch/add; changelog -> project_changelog_patch/add; .project/agents/protocol.md -> `workfile agents sync` and no record tool; .project/generated/*.md -> the generic fallback naming no tool. The new test fails against the pre-fix message and passes with it — checked by patching the built runtime back to the single card-tools string, which fails test 9 only, then restoring. pnpm run check green: 269 + 7 tests, 0 failures, strict ratchet held at 588 across 57 files, plugin copy rebuilt and byte-identical to source.
- 2026-08-03 19:23Z illodev@local#2ba09e5f — Deployment is what is pending, not verification. The report came from a repository consuming the published package, so the guard there keeps its old message until this ships; staying in review rather than done until 0.5.3 is out and the reporting repository upgrades.
- 2026-08-03 19:35Z illodev@local#2ba09e5f — Deployed. Tag v0.5.3 ran release.yml green: npm publish for both packages, MCP Registry, and the GitHub Release. Verified from outside the workflow — npm view reports 0.5.3 for @illodev/workfile and @illodev/workfile-search-local, and the release is published at v0.5.3. This was the only thing review was waiting on.
