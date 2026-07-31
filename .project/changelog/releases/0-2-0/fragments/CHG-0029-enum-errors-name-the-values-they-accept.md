---
id: CHG-0029
title: Enum errors name the values they accept
type: changed
area: core
visibility: public
cards: [T-0055]
created: 2026-07-31
updated: 2026-07-31
---

`Invalid area: treasury` sent you to `project.config.mjs` to find out what would
have worked, even though the validator had already computed the accepted values
and attached them to the error — only `--json` was printing them. The text
renderer now prints them too.

`DOC_KIND_INVALID` and `DOC_STATUS_INVALID` did not carry the values at all, so
even a JSON caller was guessing. They do now.
