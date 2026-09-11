---
id: CHG-0176
title: The release gate stops on four tooling advisories that never reached a consumer, and the overrides move past them
type: security
area: infra
visibility: internal
tags: [audit, dependencies]
created: 2026-09-11
updated: 2026-09-11
---

`pnpm audit --audit-level=moderate` reported js-yaml <4.3.2 (high, through @commitlint/cli → cosmiconfig) and three hono <4.13.5 advisories (moderate, through shadcn → @modelcontextprotocol/sdk). All four sit under devDependencies and none is in the tree a consumer resolves, but the gate has no allowlist by design (ADR-0021), so the audit job had kept `main` red since 2026-09-04 and would have failed the release. The existing `pnpm.overrides` for both packages move to `^4.3.2` and `^4.13.5`.
