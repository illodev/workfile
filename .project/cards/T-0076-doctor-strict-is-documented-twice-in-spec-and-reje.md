---
id: T-0076
title: doctor --strict is documented twice in SPEC and rejected by the CLI
status: done
type: bug
priority: low
area: core
created: 2026-08-01
updated: 2026-08-01
scope: [packages/workfile/docs/SPEC.md]
---

SPEC.md recommends `doctor --strict` at :1208 and again at :1928 as the canonical CI line. The CLI rejects it: `CLI_ARGUMENT_UNKNOWN: Unknown option for "doctor": --strict`.

Anyone following the specification to wire CI gets a hard failure on the first run.

Either implement the flag or correct both SPEC sites. Part of a wider SPEC drift problem worth its own audit — the spec also names a `project` binary that has not existed since the rename.

## Activity

- 2026-08-01 16:21Z agent:claude · claimed
- 2026-08-01 16:21Z agent:claude · claimed
- 2026-08-01 16:26Z agent:claude · doing → review
- 2026-08-01 16:46Z agent:claude · review → done

