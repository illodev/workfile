---
id: LRN-0015
title: A directory that reads your repository may not need you to log in at all
status: active
created: 2026-08-03
updated: 2026-08-03
---
Glama's listing page shows a discoverability penalty until the server is
"claimed", and every account-shaped word around it — claim, verify, admin —
reads like a browser session. [[T-0136]] planned one, sat blocked for a day
behind a 526 on their asset host, and was claimed in the end by a file that
had already been committed: `glama.json` with `maintainers: ["illodev"]`. The
next sync turned the page to "Author verified".

The mechanism is obvious once seen. A username inside a repository only its
author can push to proves authorship better than a login does, so a directory
that already crawls the repository has no reason to ask for one.

**So, before assuming a listing needs a person in a browser:** look for a
schema-backed config file the directory reads out of the repository, and check
what it is allowed to assert. `glama.ai/mcp/schemas/server.json` answered both
questions in one request — it carries `maintainers` and nothing else, so the
claim was free and the listing copy genuinely was not.

The cost of getting this backwards is not just the wait. A card that says
"blocked on a browser" stops being read, and the fix ships without anyone
noticing it worked.
