# HTTP API

`workfile ui` starts the local server (default `http://127.0.0.1:4747`). The same
core services back the CLI, the MCP server and the UI — the API is a thin layer.

## Conventions

- Managed record reads expose an `ETag`; mutations accept `If-Match` and reject
  stale writes with a conflict error.
- Errors use stable codes:

```json
{
    "error": {
        "code": "MEMORY_WRITE_CONFLICT",
        "message": "The memory record changed after it was loaded.",
        "details": {}
    }
}
```

- List endpoints accept `q`, `limit` and `offset`; responses carry `total`.
- List endpoints also accept `view=full|summary|list` and `fields=a,b,c`.
  `summary` replaces the Markdown body with `bodyBytes` and a 200-character
  `excerpt` and reduces the link arrays to ids and relations; `list` drops the
  excerpt too. `fields` overrides the view and returns exactly those keys.
  Measured on 100 records: 169 KB full, 70 KB summary, 43 KB list, 6.7 KB for
  three fields.
  `full` is the default deliberately — the packaged UI still renders record
  bodies out of its list responses — so narrowing is opt-in until it fetches
  what it displays.
- Collection reads carry an `ETag` over the page they return, and honour
  `If-None-Match` with a `304`. Cards are the corpus a polling client re-fetches
  most, so this is where it matters: the steady state costs a header exchange.
- JSON responses above ~1.4 KB are gzipped when `Accept-Encoding` allows it,
  with `Vary: Accept-Encoding`. Brotli is not offered: ~14% smaller for roughly
  an order of magnitude more CPU on a single-threaded server.
- `Cache-Control` is `no-cache` — revalidate every time, but a revalidation may
  answer `304`. It is deliberately not `no-store`, which would forbid that.

## Events

`GET /api/v2/events` is a Server-Sent Events stream of workspace changes.

```
event: hello
data: {"serverId":"aec9c77abfc871ec","lastEventId":0}

id: 1
event: records.changed
data: {"epoch":1,"count":1,"paths":[".project/cards/T-0042-example.md"]}
```

| Event | Meaning |
| --- | --- |
| `hello` | Sent on connect. `serverId` distinguishes a reconnection to the same process from one to a restarted process whose ids began again. |
| `records.changed` | Files changed. Carries the paths and the new index `epoch`. |
| `activity.changed` | A card write may have changed who is working on what. A separate event so a presence view need not refetch records. |
| `sync.reset` | Too many paths at once (a `git checkout`, a release), or the client's `Last-Event-ID` fell off the ring buffer. Refetch rather than applying a delta. |

Events are **invalidations, not payloads**: no record body ever travels down the
channel. The client fetches what the view it has mounted actually needs.

The source is a file watcher over the protocol corpus, so it sees every writer —
the CLI, an agent over MCP, git, an editor — not only mutations made through
this server. `.project/.cache` is excluded: it holds the locks that churn on
every write, the persisted index and agent activity, so watching it would feed
back into itself.

`EventSource` reconnects on its own and resumes with `Last-Event-ID`. The
watcher is a fast path and not the source of truth — `fs.watch` is silent on
network filesystems and its queue is bounded — so the index still revalidates
against the filesystem. A dropped event costs latency, never correctness.

## Diagnostics

`GET /api/v2/metrics` reports request counts per route, p50/p95 latency over the
last thousand requests, the index epoch, connected event clients and the
watcher's mode. `workfile ui --verbose` (or `PROJECT_LOG=1`) also writes one line
per request to stderr, and any 5xx logs its stack — which nothing did before, so
an error shown in the interface had no counterpart anywhere to diagnose it from.

## Activity

`GET /api/v2/activity` answers who is working on what, combining three signals
that already existed and that nothing joined up:

- the lock files `withFileLock` writes, which exist exactly as long as a write
  does — the most precise "right now" the system has;
- the durable claims in card frontmatter (`claimed_by`, `claimed_at`, `scope`);
- session heartbeats under `.project/.cache/activity/sessions/`.

Each claim carries a derived `state`: `live` (a session is signalling),
`held`, `stale` (past `cards.claimLeaseHours`) or `orphaned` (a session that
stopped signalling). That distinction is the point — a claim from four minutes
ago and one from a process that died three days ago looked identical before.

`conflicts` lists claims by *different* actors whose scopes overlap. This is the
situation claims exist to prevent, and it was computed inside `claimCard` and
then thrown away with the response.

## Request guard

The server holds unauthenticated read and write access to the repository, so the
browser's own origin rules are the entire security model. Every request is
checked before routing:

| Condition | Response |
| --- | --- |
| `Host` outside the allowlist, or its port is not the listening port | `403 REQUEST_HOST_FORBIDDEN` |
| `Sec-Fetch-Site` present and not `same-origin` / `none` | `403 REQUEST_ORIGIN_FORBIDDEN` |
| `Origin` present and outside the allowlist | `403 REQUEST_ORIGIN_FORBIDDEN` |
| `POST`/`PUT`/`PATCH`/`DELETE` with a CORS-simple or missing `Content-Type` | `415 REQUEST_CONTENT_TYPE_INVALID` |

The allowlist is `127.0.0.1`, `localhost` and `::1`, plus the bind address when
`--host` names a specific non-wildcard interface.

The last rule matters as much as the others: `text/plain`,
`application/x-www-form-urlencoded`, `multipart/form-data` and *no* content type
at all are CORS-simple, so a cross-origin page could send them without a
preflight. Requiring anything else forces a preflight, which this server never
answers.

Practical consequence for clients: **mutations must set an explicit
`Content-Type`**. Use `application/json` for the JSON API and
`application/octet-stream` (or any concrete binary type) for asset uploads. A
`fetch` that passes a `File` or an `ArrayBuffer` without setting the header will
be refused.

Non-browser clients are unaffected — `curl` sends no `Origin` and no
`Sec-Fetch-Site`, and its `Host` is the loopback address it dialled.

Assets are served with `X-Content-Type-Options: nosniff`, a
`default-src 'none'; sandbox` CSP, and `Content-Disposition: attachment` for
anything outside a narrow inline allowlist. Uploads of types that can execute
script (`.html`, `.svg`, `.mjs`, …) are refused with
`400 ASSET_TYPE_NOT_ALLOWED`.

## Workspace and index

```text
GET  /api/v2/workspace
GET  /api/v2/schema
GET  /api/v2/health
GET  /api/v2/records?q=&kind=&limit=&offset=
GET  /api/v2/search?q=&kind=&limit=&offset=&mode=
GET  /api/v2/records/:id
```

Search responses carry `mode` (`"lexical"`, `"hybrid"` or `"regex"`) and
`provider` (the semantic provider's id, else `null`), so a client can show
which search actually ran.

`/search` consults the semantic provider declared in `project.config.mjs`
(when there is one) and returns `mode: "hybrid"` with per-record
`semanticScore`; `?mode=lexical` opts out. `/records` is always lexical. A `q`
of the full `/pattern/flags` form (flags from `imsu`) runs as a regular
expression over id, title and body, bypasses the provider and returns
`mode: "regex"`; an invalid pattern is `400 SEARCH_REGEX_INVALID`.

## Work

```text
GET/POST  /api/v2/cards
PATCH     /api/v2/cards/:id
POST      /api/v2/cards/:id/claim
POST      /api/v2/cards/:id/transition
POST      /api/v2/cards/:id/archive
POST      /api/v2/cards/:id/reopen
POST      /api/v2/cards/bulk
```

`PATCH /api/v2/cards/:id`, `POST /api/v2/cards/:id/transition` and
`POST /api/v2/cards/bulk` accept `method`, `run` and `evidence` beside `actor`,
`force` and `reason`. They describe the write rather than the card, so they are
lifted out of the flat body the same way `force` is, and a client that sends
`{"status": "done", "method": "ci", "run": "https://…"}` gets a card whose
`verified` block says so. Sending any of them on a write that does not move the
card into `done` is `400 CARD_VERIFICATION_NOT_APPLICABLE` rather than a silent
drop; `method: "forced"` is `400 CARD_VERIFICATION_METHOD_CONFLICT`, since it is
derived from what `force` waived. The legacy `PATCH /api/tasks/:id` accepts the
same three.

A method the card's area does not accept is `409 CARD_VERIFICATION_METHOD_REFUSED`,
and the body's details carry the accepted list. Omitting `method` is not a way
around it — a close with none records `local`, which is judged like any other.
`GET /api/v2/schema` reports the policy under `cards.verification.methods`, so a
client can read it before it writes. `force` with a `reason` waives it, and the
card then records `forced`.

## Docs

```text
GET/POST   /api/v2/docs
GET/PATCH  /api/v2/docs/:id
```

## History

```text
GET/POST   /api/v2/changelog
GET/PATCH  /api/v2/changelog/:id
POST       /api/v2/changelog/releases/preview
POST       /api/v2/changelog/releases
GET/POST   /api/v2/changelog/render
```

## Memory

```text
GET/POST   /api/v2/memory
GET/PATCH  /api/v2/memory/:id
POST       /api/v2/memory/:id/graduate
POST       /api/v2/memory/:id/supersede
```

## Agents and CI

```text
GET   /api/v2/agents
POST  /api/v2/agents/sync
GET   /api/v2/agents/context?card=T-0001
GET   /api/v2/ci
POST  /api/v2/ci/sync
```

## MCP inspection

```text
GET  /api/v2/mcp
GET  /api/v2/mcp/config
```

## Legacy routes

`/api/tasks`, `/api/health` and `/api/knowledge` remain for existing callers.
The packaged UI no longer uses the first two: it boots from
`/api/v2/workspace` (identity plus the runtime schema) and reads
`/api/v2/cards`, which — unlike `/api/tasks` — honours `q`, `limit`, `offset`
and `view`, and carries an ETag.

Asset upload is still `POST /api/tasks/:id/assets`; it has no v2 equivalent yet.

New integrations should target `/api/v2/*`.
