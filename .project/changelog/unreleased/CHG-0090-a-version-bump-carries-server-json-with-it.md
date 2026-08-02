---
id: CHG-0090
title: A version bump carries server.json with it
type: fixed
area: infra
visibility: public
created: 2026-08-02
updated: 2026-08-02
cards: [T-0131]
---
`npm version` commits `package.json` plus whatever the `version` hook staged,
and the hook named the files itself — `git add packages/*/package.json`. That
list stopped being complete when `server.json` arrived: the sync script rewrote
it and the bump committed without it, leaving the tag on a tree that stated one
version for the package and another for the MCP server it resolves to.

The release workflow would have caught it before publishing anything, but only
after the tag was cut and pushed, which is the expensive place to find out.

The hook no longer keeps its own list. The script stages what it wrote, so a
third output cannot fall out of the commit the way the second did — and it
stages only under `--stage`, so aligning versions by hand still leaves the
index alone.
