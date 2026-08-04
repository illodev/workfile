---
id: CHG-0104
title: The security policy links a threat model that exists
type: fixed
area: docs
visibility: public
cards: [T-0149]
created: 2026-08-04
updated: 2026-08-04
---

`SECURITY.md` closed its scope section by pointing at `docs/security.md`. The
repository root has no `docs/`; the file is `packages/workfile/docs/security.md`.
GitHub renders SECURITY.md in the Security tab, so the link a reporter follows
to find out what is in scope before filing was a 404 — on the page whose whole
job is answering that.

It was the only broken link in the documentation, and it survived because
SECURITY.md is the one document nothing read: it is outside the `docs.sources`
glob, so the freshness tracking never indexed it, and it was missing from the
list the documentation suite opens, so none of the checks saw it.

Both gaps are closed. SECURITY.md is now an indexed document and part of the
checked set, and a new check resolves every relative link in that set against
the filesystem — it fails on the old link, naming it, and passes on the new
one. Anchors are stripped rather than verified, because a missing heading
depends on how the renderer slugifies and a check that guesses would fail on
correct links.
