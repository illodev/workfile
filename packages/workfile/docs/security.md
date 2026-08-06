# Security model

Workfile is a local tool. Its threat model is small but not empty, and
the parts that matter are not obvious, so they are written down here.

## What the local server is

`workfile ui` starts an HTTP server that has **unauthenticated read and write
access to the repository**. There is no login, no token and no per-user
permission: if a request reaches the handler, it can read every record body and
write every managed file.

That is a deliberate trade — it is a developer tool bound to loopback — but it
means the browser's own origin rules *are* the security model. Everything below
exists to make sure they actually apply.

## Boundaries the server enforces

**Origin.** Requests are checked before routing. `Host` must be in the
allowlist and its port must match the port actually being listened on;
`Sec-Fetch-Site` must be `same-origin` or `none`; `Origin`, when present, must
be in the allowlist. See [`http-api.md`](http-api.md#request-guard) for the
exact codes.

The `Host` check is not redundant with the `Origin` check. Without it, DNS
rebinding puts an attacker's page on the *same* origin as the server, which
means it can read responses rather than only writing blind.

**Preflight.** Mutating methods must declare a `Content-Type` that is not
CORS-simple. `text/plain`, `application/x-www-form-urlencoded`,
`multipart/form-data` and *no content type at all* are simple: a cross-origin
page can send them without a preflight, and the browser only hides the
response. Requiring anything else forces a preflight, which this server never
answers.

**Path containment.** Every repository-relative path resolves through
`containedPath`, which is the single containment criterion for configured
paths, asset names and document scopes. Asset names are reduced to a
`basename` and stripped of separators.

**Read-only workspaces.** `ensureWritable` lives in `src/core/guards.ts` and is
called from the mutation layer of every module plus the three surface-level
write paths (agent instructions, CI templates, asset uploads). It is one
function on purpose: while it was four private copies, the three paths that
never got one silently ignored `readOnly`.

**Body limits.** JSON bodies are capped at 1 MiB and asset uploads at 25 MiB.
Individual record files are rejected above `docs.maxFileBytes` before being
read.

## Uploaded assets

Assets attached to cards are repository content supplied by whoever can reach
the server, and they are served from the same origin as the API. Two rules keep
them inert:

- Only a narrow allowlist (`png`, `jpg`, `jpeg`, `gif`, `webp`, `pdf`, `txt`,
  `md`, `csv`) is served inline. Everything else is
  `application/octet-stream` with `Content-Disposition: attachment`.
- Types that can execute script — `.html`, `.htm`, `.xhtml`, `.xml`, `.svg`,
  `.js`, `.mjs`, `.cjs`, `.wasm` — are refused **at upload time** with
  `ASSET_TYPE_NOT_ALLOWED`, not merely at serve time. Blocking them at rest
  means a future change to the serving rules cannot resurrect the vector on
  files already on disk.

Responses carry `X-Content-Type-Options: nosniff` and a
`default-src 'none'; sandbox` content security policy.

`image/svg+xml` is excluded on purpose even though SVG is an image: it executes
script.

## Rendering repository content

The UI renders Markdown bodies into React elements and never uses
`dangerouslySetInnerHTML`. Combined with React's own `href` sanitisation, there
is no XSS vector from record content.

**This property is load-bearing.** Any future editor or renderer must keep
generating elements rather than raw HTML. Introducing a Markdown pipeline that
emits an HTML string would reopen a hole that is currently closed.

## Binding to a non-loopback address

`workfile ui --host` accepts an address other than loopback. Doing so exposes
unauthenticated read and write access to the repository to everyone who can
reach that interface. The bind address is added to the `Host` allowlist so the
server is usable, but no authentication is added — because there is none to
add.

Treat `--host` as equivalent to publishing the repository, and prefer an SSH
tunnel.

A wildcard bind (`--host 0.0.0.0`, which is what serving from a container
needs) contributes nothing to the allowlist, so the board also needs
`--allowed-host` to name the address people will reach it by. Both flags are
about reachability; neither adds authentication.

## Publishing a board people only read

`workfile ui --read-only` loads the workspace read-only, so every mutating
route answers `409 WORKSPACE_READ_ONLY` — the same `ensureWritable` guard the
MCP server uses, applied in the one place all writes pass through, not per
route. The UI reads the flag and stands its editing affordances down.

This narrows what a reader can do; it does not decide who the readers are. A
published board still serves every card, document, changelog fragment and
memory record to anyone who can reach it, so put something that authenticates
in front of it — the deployment shape this was built for is a reverse proxy
with HTTP basic auth, with the board itself on an internal network.

## What is deliberately out of scope

- **Multi-user authorisation.** There are no accounts and no roles. A workspace
  is trusted as a whole.
- **Protecting the repository from its own agents.** An agent with shell access
  can edit `.project/` directly. Claims and scopes are coordination, not
  security.
- **Secrets in records.** Nothing encrypts record bodies. Markdown in
  `.project/` is as public as the repository it lives in.

## Reporting

Please report suspected vulnerabilities privately through the repository's
security advisory form rather than a public issue.
