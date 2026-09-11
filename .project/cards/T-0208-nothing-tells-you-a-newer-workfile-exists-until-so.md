---
id: T-0208
title: Nothing tells you a newer Workfile exists until something breaks
status: done
type: feature
priority: medium
area: core
tags: [cli, ui]
effort: M
scope: [packages/workfile/src/modules/upgrade, packages/workfile/src/config, packages/workfile/src/types.ts, packages/workfile/src/server/http.ts, packages/workfile/bin/workfile.ts, packages/workfile/ui/src, packages/workfile/docs, packages/workfile/project.config.example.mjs]
created: 2026-08-05
updated: 2026-09-11
verified:
  at: "2026-09-11T18:29:46.699Z"
  method: manual
  commit: 6ad9c5e0437bae65b0c941685334c48d40d9910f
  digest: "sha256:551329b70cf6caa21d34839645eb76619eaf30eb3143339339b097e9d96637b2"
---

`workfile upgrade` resyncs every managed surface once you know a bump happened.
Nothing tells you one happened. The installed version is only compared against
the stamps *inside the workspace* — `surfaceBehind` checks whether the generated
agent instructions and CI templates trail the package that is installed — so a
repository can sit two releases behind indefinitely with every check green.

That is exactly the shape of the failure `runUpgrade`'s own comment describes: a
consumer forgot part of a manual sequence twice and ended up with three stamps at
once while the checks stayed green. Knowing the package itself is behind is one
rung further out, and nothing is watching it.

## What has to be decided, not assumed

**Where the check runs.** A CLI that reaches the network on every invocation is a
CLI that hangs on a bad DNS day, and `doctor` runs in CI on every pull request.
The check must be off the critical path, cached, and skippable — and a project
that has opted out of network access entirely must be able to say so once, in
config, rather than per command.

**What it costs when there is no network.** Silence, not a warning about the
warning. An offline machine must behave exactly as it does today.

**Where it surfaces.** The UI has a footer that already carries workspace state.
The CLI has no persistent surface, so it is a line after a command rather than
before it — an update notice that delays the output of every command is worse
than not having one.

**Whether it ever writes anything.** A cache file under `.project/.cache` is the
obvious home and is already gitignored. Nothing about this may touch a record.

Raised in the same triage as T-0191 through T-0198 and not filed at the time.

## Acceptance criteria

- [x] A workspace running behind the latest published version is told so by `workfile upgrade` and by the
      interface's footer — the two surfaces the owner chose on 2026-09-11; `doctor`, the generated CI and
      every other command never ask. (Originally "in the CLI and in the UI"; the CLI surface is `upgrade`,
      not every command, because a CLI that reaches the network on every invocation hangs on a bad DNS day.)
- [x] The check never delays a command's output and never fails one, including with no network at all.
- [x] It is cached, and the interval is stated rather than implicit.
- [x] A project can turn it off in config, and doing so removes the network access entirely rather than hiding the message.
- [x] Nothing it does writes to a record, and the cache it writes is not committed.
- [x] The behaviour is documented, including what it sends and to whom.

## Built

`checkForUpdate` in `modules/upgrade/update-check.ts`: one `GET` to
`<registry>/@illodev%2Fworkfile/latest` (`npm_config_registry` honoured, `registry.npmjs.org`
otherwise), three-second timeout, cached in `storage.cache/update-check.json` for 24 hours and a
failed attempt for one hour, `upgrade.check: false` returns `disabled` without reading the cache or
touching the wire. `runUpgrade` asks first and reads last, so the line lands after the report;
`unknown` and `disabled` print nothing. `/api/v2/update` serves the same answer and the footer shows
`vX.Y.Z available` only when `behind`, once per page load. Documented in `cli.md`, `http-api.md` and
a new section of `security.md` that states what is sent and to whom.

## Notes

- 2026-09-11 17:32Z illodev@local#597ecdc9 — Decided by the owner on 2026-09-11: the check lives in the UI footer and in workfile upgrade, and nowhere else — doctor and the generated CI never touch the network. One GET to the npm registry for @illodev/workfile, cached 24 h under .project/.cache, off entirely with a config switch, silent when there is no network or the registry answers anything but a version. Criterion 1 is rewritten accordingly: the CLI surface is upgrade, not every command.
- 2026-09-11 18:29Z illodev@local#597ecdc9 — Live evidence on 2026-09-11, this repository, dist built from this change. CLI: a local fake registry (scratch node http server answering {version:"0.99.0"}) set through npm_config_registry; 'workfile upgrade --dry-run' printed the surfaces first and then 'BEHIND v0.12.0 installed, v0.99.0 published — pnpm add -D @illodev/workfile@latest, then run workfile upgrade again'; the registry log shows exactly one request across three runs (GET /@illodev%2Fworkfile/latest, accept application/json, user-agent node), the second and third answered from .project/.cache/update-check.json (source cache, nextCheckAt +24 h). Against the real registry: 'latest v0.12.0 is the newest published version (checked just now)'. UI: startProjectServer on 127.0.0.1:4790 with the same env; /api/v2/update answered status behind; headless Chromium rendered the footer badge 'v0.99.0 available' with title 'v0.12.0 installed, v0.99.0 published — update @illodev/workfile, then run workfile upgrade' linking to the v0.99.0 release page (footer-update.png in the session scratchpad). Offline path covered by upgrade.test.ts: a throwing fetch yields unknown, cached for one hour, nothing thrown. Suite 526/526, strict held at 424, doctor clean.
- 2026-09-11 18:29Z illodev@local#597ecdc9 — manual verification: Live on 2026-09-11 in this repository with the built dist: 'workfile upgrade --dry-run' against a local registry publishing 0.99.0 printed the BEHIND line after the surfaces, one GET across three runs (the rest from .project/.cache/update-check.json); against the real registry it printed 'latest v0.12.0 is the newest published version (checked just now)'. The UI served from dist rendered the footer badge 'v0.99.0 available' in headless Chromium (footer-update.png in the session scratchpad); /api/v2/update answered behind. Offline path pinned by upgrade.test.ts (unknown, cached an hour, nothing thrown). Suite 526/526, strict held, doctor clean.

## Activity

- 2026-09-11 18:18Z illodev@local#597ecdc9 · claimed
- 2026-09-11 18:29Z illodev@local#597ecdc9 · doing → done
