---
id: CHG-0094
title: Every release publishes its notes to GitHub
type: added
area: infra
visibility: public
created: 2026-08-02
updated: 2026-08-02
cards: [T-0137]
---
A `v*` tag published to npm and to the MCP Registry and stopped there, so the
releases page was empty across twelve versions while the changelog itself was
kept fragment by fragment.

The release note is now the version's section of `CHANGELOG.md`, which
`changelog release` already rendered from those fragments — one source, so the
note and the changelog cannot disagree. A tag cut before the changelog was
released fails the step rather than publishing an empty note.

It runs as its own job. Creating a release needs `contents: write`, and a
job's permissions replace the workflow's rather than extend them, so the write
scope stays off the steps that install dependencies and run the suite.
