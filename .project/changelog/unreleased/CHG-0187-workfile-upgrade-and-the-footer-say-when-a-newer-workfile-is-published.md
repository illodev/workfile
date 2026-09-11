---
id: CHG-0187
title: workfile upgrade and the footer say when a newer Workfile is published
type: added
area: core
visibility: public
cards: [T-0208]
created: 2026-09-11
updated: 2026-09-11
---

Nothing told a workspace that the package itself was behind: the installed version was only ever compared against the stamps inside the workspace, so a repository could sit two releases behind with every check green.

`workfile upgrade` now asks the npm registry for the latest published `@illodev/workfile` — one `GET`, no body, nothing that names the workspace, `npm_config_registry` honoured — and prints a `BEHIND` line with the install command for the package manager in use, or a `latest` line when current. The interface's footer shows a `vX.Y.Z available` badge from the same answer. The check is cached for 24 hours under `.project/.cache` (a failed attempt for an hour), starts before the surfaces are compared so it delays nothing, prints nothing when there is no network, and `upgrade.check: false` removes the request entirely. `doctor`, the generated CI and every other command never reach the network; the security model now states exactly what is sent and to whom.
