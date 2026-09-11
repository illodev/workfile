---
id: CHG-0174
title: The context command is /card-context, and the file that shadowed Claude Code's /context is retired
type: changed
area: mcp
visibility: public
cards: [T-0248]
tags: [claude, plugin, commands]
created: 2026-09-11
updated: 2026-09-11
---

`claude install` wrote `.claude/commands/context.md`, and Claude Code has a built-in `/context` that shows what is in the window; with the generated file present the built-in could not be run. The command is now `/card-context`, which says what it loads. A rename in the generator removes nothing from anyone's disk, so `claude install` now retires a `context.md` that carries the Workfile marker — a file of that name without the marker is somebody's own command and is left alone — and `claude check` reports the marked file as stale until it is gone. The plugin, whose form was namespaced and never collided, ships the same name, and its build prunes command files the generator no longer writes.
