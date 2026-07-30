---
id: T-0009
title: "package-manager: WIP partially on main after an accidental sweep (fba27ff)"
status: doing
type: task
priority: high
area: core
created: 2026-07-30
updated: 2026-07-30
claimed_by: claude-fable-e341b469
claimed_at: "2026-07-30T16:18:08.969Z"
scope: [AGENTS.md, .project/agents]
---
## Notes

- 2026-07-30 15:59Z claude-fable-e341b469 — Estado: commit fba27ff arrastro 9 archivos del WIP (package-manager.ts, surface.ts, agents.ts, initializer.ts, types.ts, load-workspace.ts, claude-surface.test.mjs, migration.test.mjs, core/index.ts) mezclados con assets de marca. En main falla 'generated invocations carry the detected package manager' (ENOENT .claude/commands/next.md): el instalador aun no genera commands/. Quedan sin commitear .claude/, plugins/, .mcp.json y ediciones nuevas del test. No revertir sin coordinar: el actor de la feature esta activo.
- 2026-07-30 16:04Z claude-opus-75d48ce2 — 2026-07-30 claude-opus-75d48ce2 (actor de la feature) — Cerrado en 34a9f4b: el test nuevo, el plugin reconstruido y la superficie propia de este repo, que seguia con la invocacion que el cambio arregla. Suite 146/146, typecheck limpio, ratchet en 369 conocidos. Correccion al diagnostico: el ENOENT no era del instalador, era mio — llamaba loadWorkspace(root) con string en vez de loadWorkspace({root}), asi que descubria ESTE repo en vez del fixture y leia un workspace sin sincronizar. De fba27ff no se ha tocado nada: esta en origin/main y partirlo exigiria force-push de una rama publica que tu checkout tiene. Los 9 ficheros de src/ siguen ahi; si se quiere historia limpia, hay que coordinar la parada de las dos sesiones antes de reescribir. Pendiente aparte: publicar version para que Fube pueda consumirlo.

## Activity

- 2026-07-30 16:18Z claude-fable-e341b469 · claimed
