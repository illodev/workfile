---
id: T-0009
title: "package-manager: WIP parcialmente en main por barrido accidental (fba27ff)"
status: backlog
type: task
priority: high
area: core
created: 2026-07-30
updated: 2026-07-30
---
## Notes

- 2026-07-30 15:59Z claude-fable-e341b469 — Estado: commit fba27ff arrastro 9 archivos del WIP (package-manager.ts, surface.ts, agents.ts, initializer.ts, types.ts, load-workspace.ts, claude-surface.test.mjs, migration.test.mjs, core/index.ts) mezclados con assets de marca. En main falla 'generated invocations carry the detected package manager' (ENOENT .claude/commands/next.md): el instalador aun no genera commands/. Quedan sin commitear .claude/, plugins/, .mcp.json y ediciones nuevas del test. No revertir sin coordinar: el actor de la feature esta activo.
