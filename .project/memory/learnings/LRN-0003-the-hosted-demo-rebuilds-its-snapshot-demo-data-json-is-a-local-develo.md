---
id: LRN-0003
title: "The hosted demo rebuilds its snapshot: demo-data.json is a local-development artifact"
status: active
created: 2026-07-31
updated: 2026-07-31
---
`vercel.json` runs `pnpm run build:demo`, and that script is `pnpm run demo:data && vite build --mode demo`. The hosted demo therefore regenerates its snapshot from the `.project/` Markdown of the commit being deployed, every deploy, before Vite ever bundles. The tracked `packages/workfile/ui/src/demo-data.json` is overwritten in that build and never reaches the web: it exists so a local `--mode demo` run has data without rebuilding the core first.

The practical consequence is the whole point of this record. When the hosted demo shows a stale board, the snapshot file is not the cause and regenerating it is not the fix. What the demo shows is whatever `.project/` looked like *in the deployed commit* - so a board that still lists the release card as `doing` means the deploy came from the tag commit, before the card was closed, and the next push corrects it on its own.

This was learned the hard way during 0.1.8: the demo was reported showing one card in doing and three in backlog, which matched commit 42581a6 exactly - T-0050 was closed one commit later in 9c9c3ea. The diagnosis went to the tracked file instead of the deployed commit, and commit 95e3fbd carries a message asserting the hosted demo read a stale JSON. It does not. The file was updated anyway, which is harmless and keeps local development honest, but the reasoning in that message is wrong and this record supersedes it.

Worth noting for the same reason: the snapshot is taken mid-release by definition, since the release card is open while the release is being cut. Both 0.1.7 and 0.1.8 committed a snapshot showing their own release card in flight. Harmless for the web, misleading in a diff.
