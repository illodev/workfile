---
id: T-0248
title: The generated /context command shadows Claude Code's own /context
status: next
type: bug
priority: medium
area: mcp
tags: [claude, plugin, commands]
scope: [packages/workfile/src/modules/claude/surface.ts, packages/workfile/test/claude-surface.test.ts, plugins/workfile/commands, .claude/commands, README.md, packages/workfile/docs/mcp.md]
raised: reported
created: 2026-09-11
updated: 2026-09-11
---

`workfile claude install` writes `.claude/commands/context.md`, and the plugin ships `commands/context.md`. Claude Code has a built-in `/context`, which shows what is in the window. With the file present the picker offers the generated one and the built-in cannot be run — reported by the owner on 2026-09-11 from this repository.

The plugin form is namespaced (`/workfile:context`) and does not collide. The generated form is not, and it is the one every consumer that ran `claude install` has.

The other three commands (`/next`, `/claim`, `/done`) have no built-in counterpart today. Only `context` is renamed. The new name is `card-context`: it says what it loads and reads beside `/claim T-0042`.

A rename in the generator is not a rename on disk. `syncManagedFile` writes the files it plans and never removes one, so every consumer keeps `context.md` — with a Workfile marker — shadowing the built-in after upgrading. The sync has to retire the old file when it carries our marker, and `claude check` has to report it while it is there.

## Acceptance criteria

- [ ] The generated command is `.claude/commands/card-context.md`; `context.md` is no longer generated.
- [ ] `claude install` removes a `.claude/commands/context.md` that carries the `claude-command-context` marker, and leaves one without it alone.
- [ ] `claude check` reports a marked `context.md` as stale until it is removed.
- [ ] The plugin, `README.md`, `docs/mcp.md` and DOC-0004 name `/card-context`.
- [ ] Runtime: in this repository, `/context` opens Claude Code's built-in after `claude install`.
