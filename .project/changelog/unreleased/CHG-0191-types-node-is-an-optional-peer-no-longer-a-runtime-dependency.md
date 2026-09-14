---
id: CHG-0191
title: @types/node is an optional peer, no longer a runtime dependency
type: changed
area: infra
visibility: public
cards: [T-0251]
created: 2026-09-14
updated: 2026-09-14
---

`@illodev/workfile` declared `@types/node` as a pinned runtime dependency, so every install put that exact version into the consumer's tree: moving to 0.13.0 re-keyed 79 lockfile entries in a consuming repository whose own manifests had not asked for it. `dependencies` is now empty, and `@types/node` is an optional peer with no version range (`*`) — nothing is installed or pinned for you.

Two of the published declaration files name Node types, so a TypeScript consumer that type-checks them with `skipLibCheck: false` needs `@types/node` in its own tree, as almost every Node project already has it. With `skipLibCheck: true`, or without TypeScript, nothing changes.
