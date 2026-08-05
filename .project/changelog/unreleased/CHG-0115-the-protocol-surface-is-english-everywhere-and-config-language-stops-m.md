---
id: CHG-0115
title: The protocol surface is English everywhere, and config.language stops meaning anything
type: removed
area: core
visibility: public
created: 2026-08-05
updated: 2026-08-05
---
`config.language` rendered the agent protocol, the four workflows, the adapter
files and the context bundle in Spanish. It shipped in the first commit and was
never a decision anybody took: CONV-0001 had already made records English, and
T-0061 translated the Spanish filenames that predated it. The translation moved
the records and left the rendering behind.

The SPEC promised three localizable things — UI labels, generated instructions
and record bodies. Two were never built and one was deliberately reversed. Only
generated instructions were real.

They are English now. Fifteen branches, the config key's effect, the
`--language` CLI flag and the interactive prompt are gone, and SPEC invariant 4
says what the code does. `getting-started.md` and the README stop teaching a
flag that no longer exists.

**Upgrading.** A `project.config.mjs` that still declares `language` loads and
runs unchanged — the key is accepted and ignored, on the loader and on
`ProjectConfigInput`, so neither a plain config nor a typed one has to be
edited. A workspace that was rendering Spanish will report its generated
instructions as stale on the next `doctor`; `workfile upgrade` rewrites them in
English. `workfile init --language es` now fails with `CLI_ARGUMENT_UNKNOWN`
rather than being quietly ignored.

Recorded as ADR-0012.
