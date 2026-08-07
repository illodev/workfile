---
id: T-0222
title: The hono advisory rides shadcn's MCP SDK into every install
status: done
type: task
priority: low
area: infra
tags: [security]
scope: [package.json, .github/workflows, scripts/audit-consumer.ts]
origin: [T-0148]
created: 2026-08-07
updated: 2026-08-07
related: [ADR-0021, T-0148, T-0221]
verified:
  at: "2026-08-07T18:39:22.286Z"
  method: local
  commit: 11ad498e7e3d622e51a16cdd36a50bffd820e461
  digest: "sha256:44048dbe894ec211d85b7332159e970a3337c4e4a598a79437f8e6ddc09405a6"
---

GHSA-8j4g-w8fx-2239, ReDoS in hono's CORS middleware via
`Access-Control-Request-Headers`, moderate, patched in 4.12.34. Dependabot alert 4
on the default branch, and it had been sitting there for days.

The path is a single one: `shadcn` → `@modelcontextprotocol/sdk` →
`@hono/node-server` → `hono`, and `shadcn` is a devDependency of
`@illodev/workfile`. Nothing published reaches it, so it is the honest kind of
override — the same class as `fast-uri` and `js-yaml`, and the opposite of the
`sharp` and `adm-zip` entries T-0221 had to remove.

**The better fix was checked first and does not exist.** `docs/ui.md` teaches
`pnpm dlx shadcn@latest add <component>`, no script invokes a local `shadcn`
binary, and removing the devDependency would have taken `hono` out of the graph
along with one of two `fast-uri` paths and one `js-yaml` path. But
`ui/src/styles.css` has `@import "shadcn/tailwind.css"`, which resolves to
`shadcn/dist/tailwind.css` and carries the `scroll-fade-*` utilities the Boards,
Memory and attachment components use. The package is load-bearing at build time,
not just tooling.

**And the reason it kept bothering somebody rather than being caught.** The audit
gate ran at `--audit-level=high` while Dependabot alerts at `moderate`. So this
advisory could never turn anything red: it went to the security tab and stayed
there. A gate whose floor is above the floor of something that already reports
guarantees a backlog somewhere nobody is obliged to look. Both audits now block at
`moderate`, recorded in ADR-0021.

## Acceptance criteria

- [x] `pnpm audit` reports nothing at moderate or above.
- [x] The consumer tree gate applies the same floor.
- [x] The threshold change is recorded, with what it will cost.

## Activity

- 2026-08-07 18:36Z illodev@local#42eb42f5 · claimed
- 2026-08-07 18:39Z illodev@local#42eb42f5 · released

## Notes

- 2026-08-07 18:39Z illodev@local#42eb42f5 — Overridden hono to ^4.12.34; it resolves to 4.13.1 and pnpm audit now reports nothing at any level, low included.
Checked the better fix first and it does not exist. docs/ui.md teaches pnpm dlx shadcn@latest add, no script invokes a local shadcn binary, and dropping the devDependency would have removed hono from the graph entirely plus one of two fast-uri paths and one js-yaml path. But ui/src/styles.css imports shadcn/tailwind.css, which resolves to shadcn/dist/tailwind.css and carries the scroll-fade utilities Boards, Memory and attachment.tsx use — I confirmed the rules are in the built CSS. The package is load-bearing at build time, so the override is the right answer here rather than the lazy one.
The systemic half is the threshold. The gate ran at high while Dependabot alerts at moderate, so this advisory could not turn anything red and went to the security tab instead — which is the actual reason it went unaddressed for days rather than anything about hono. Both audits now block at moderate. It cost nothing at the time because both trees were clean at low, and the cost to expect is stated in ADR-0021 and CHG-0150: an advisory against a transitive devDependency will now turn unrelated pull requests red until an override lands. That is the trade, and it is the same one the no-allowlist posture already made.
Also corrected scripts/audit-consumer.ts, whose header still described the sharp and adm-zip overrides as present after T-0221 removed them.
- 2026-08-07 18:39Z illodev@local#42eb42f5 — local verification: pnpm audit reports no known vulnerabilities at --audit-level=moderate and at --audit-level=low, from a clean install with the hono override. pnpm why hono resolves 4.13.1 through the single shadcn > MCP SDK > @hono/node-server path. pnpm run audit:consumer clean at moderate and above with nothing below it. pnpm run check green: 465 + 10 tests pass, strictNullChecks held at 488. The shadcn removal alternative was ruled out by evidence, not assumption: the scroll-fade rules it supplies via shadcn/dist/tailwind.css are present in the built CSS.
