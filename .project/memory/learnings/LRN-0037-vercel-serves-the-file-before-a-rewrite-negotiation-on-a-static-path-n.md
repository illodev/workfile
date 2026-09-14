---
id: LRN-0037
title: Vercel serves the file before a rewrite; negotiation on a static path needs routes
status: active
created: 2026-09-14
updated: 2026-09-14
---

Measured on 2026-09-14 while giving every page of `site/` a Markdown twin ([[T-0259]]).

Vercel documents, for `rewrites`, that "precedence is given to the filesystem prior to rewrites being applied". A rewrite of `/` or `/docs/cli` conditioned on `Accept: text/markdown` therefore never fires: a file already answers those paths, so negotiation written that way is silently a no-op.

`routes` entries run in order before the filesystem, take the same `has` conditions, substitute capture groups into header values, and coexist with `cleanUrls`. On the preview deployment of PR #46 they returned the Markdown twin with `Vary: Accept` for `/`, `/docs/cli` and `/vs/beads`, the HTML with a `Link: rel="alternate"` header, a `canonical` Link on each `.md`, and `/docs/cli.html` still redirected 308 to `/docs/cli`.

Preview deployments of the site project sit behind Vercel Authentication: `curl` gets a 302 to `vercel.com/sso-api` on every path, which reads like a routing failure and is not one. A Share link from the deployment sets a cookie that lets `curl` check the preview, and nothing has to be stored.

## How to apply

- Header-conditioned responses on the site go in `routes`: header-only entries with `continue: true` first, the terminating `dest` last.
- Check a routing change on a shared preview with `curl -H "Accept: text/markdown"` before it reaches `main`; a local emulation proves the files, not the platform.
