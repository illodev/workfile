---
id: T-0208
title: Nothing tells you a newer Workfile exists until something breaks
status: backlog
type: feature
priority: medium
area: core
tags: [cli, ui]
effort: M
scope: [packages/workfile/src/modules/upgrade]
created: 2026-08-05
updated: 2026-08-05
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

- [ ] A workspace running behind the latest published version is told so, in the CLI and in the UI.
- [ ] The check never delays a command's output and never fails one, including with no network at all.
- [ ] It is cached, and the interval is stated rather than implicit.
- [ ] A project can turn it off in config, and doing so removes the network access entirely rather than hiding the message.
- [ ] Nothing it does writes to a record, and the cache it writes is not committed.
- [ ] The behaviour is documented, including what it sends and to whom.
