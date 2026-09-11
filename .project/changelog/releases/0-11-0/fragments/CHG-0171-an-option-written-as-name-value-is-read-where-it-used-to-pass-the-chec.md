---
id: CHG-0171
title: An option written as --name=value is read, where it used to pass the check and vanish
type: fixed
area: core
visibility: public
cards: [T-0242]
tags: [cli]
created: 2026-09-11
updated: 2026-09-11
---

The flag check admitted `--name=value` and every reader looked for the bare token, so `--expected-revision=REV` was accepted and never compared: the patch ran unguarded and exited 0, which a consumer saw as a truncated revision applying. The same was true of every option that takes a value. One walk over argv now serves every reader, so both spellings read the same, and a flag that takes no value refuses one — `--json=true` is `CLI_ARGUMENT_INVALID` — instead of being read as the bare flag.
