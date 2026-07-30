---
id: T-0033
title: "Security: adm-zip overridden to 0.6, clearing the onnxruntime advisory"
status: done
type: task
priority: high
area: infra
created: 2026-07-30
updated: 2026-07-30
---
## Evidence

The v0.1.4 Release run failed at `pnpm audit --audit-level=high`: GHSA-xcpc-8h2w-3j85 (adm-zip <0.6.0, 4GB allocation on a crafted ZIP) arrived transitively via `@huggingface/transformers@4.2.0 → onnxruntime-node → adm-zip` after the Dependabot major merge. Every test had already passed — the audit gate did exactly its job, before publish.

## Fix

Root `pnpm.overrides` gains `"adm-zip": "^0.6.0"`, the same mechanism T-0023 used for sharp. Verified locally: `pnpm audit --audit-level=high` reports no known vulnerabilities, and the real-model smoke still loads onnxruntime and ranks cross-lingually (warm 6ms). The v0.1.4 tag was moved to the fixed commit — nothing had been published under it.

## Activity

- 2026-07-30 23:10Z claude-fable-e341b469 · backlog → done
