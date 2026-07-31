---
id: T-0037
title: No CLI path to title a release record
status: done
type: bug
priority: low
area: core
created: 2026-07-31
updated: 2026-07-31
scope: [packages/workfile/src/cli]
---
## Activity

- 2026-07-31 18:58Z claude-opus-7c645bf5 · claimed
- 2026-07-31 19:04Z claude-opus-7c645bf5 · doing → review
- 2026-07-31 19:09Z claude-opus-7c645bf5 · review → done
- 2026-07-31 19:09Z claude-opus-7c645bf5 · released

## Notes

- 2026-07-31 19:04Z claude-opus-7c645bf5 — The premise was wrong, and the fix is one line of help text. The CLI has accepted --title all along: bin/workfile.ts passes option("--title") straight into createRelease, and changelog.ts:643 falls back to `Version ${version}` only when it is absent. Verified empirically in a scratch workspace rather than by reading: 'changelog release 1.0.0 --title "The Big One"' writes title: The Big One into the release record.

What was actually broken is that the binary's usage line omitted the flag while docs/cli.md:155 documented it and README.md:245 showed a worked example. So the two places a reader is sent to were right and the one place the tool describes itself was wrong. That is not academic: 0.1.8 was cut twenty minutes before this card was picked up, and it went out titled 'Version 0.1.8' precisely because the usage was consulted and showed no such flag. All eight releases in this repository carry the generic title for the same reason.

Usage now reads: changelog release VERSION [--title TITLE] [--date YYYY-MM-DD] [--fragments CHG-0001,CHG-0002]. --date got the same treatment; it was equally undocumented and equally supported.
