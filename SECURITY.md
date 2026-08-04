# Security

## Reporting

Report suspected vulnerabilities privately through this repository's **Security
advisories** tab rather than a public issue.

## What is in scope

`workfile ui` starts a local HTTP server with **unauthenticated read and write
access to the repository**. That is deliberate for a developer tool bound to
loopback, and it makes the browser's own origin rules the entire security
model — so anything that lets a page bypass them is in scope:

- reaching the API from another origin (`Origin`, `Sec-Fetch-Site`, `Host`);
- getting a request treated as a CORS "simple request" so it skips preflight;
- executing script from an uploaded asset in the server's origin;
- escaping the workspace through a configured path, an asset name or a
  document scope;
- writing through a surface that ignores `readOnly`.

The threat model, and what is deliberately *out* of scope, is written up in
[`packages/workfile/docs/security.md`](packages/workfile/docs/security.md).

## Supported versions

The most recent published release. This is a pre-1.0 package; fixes land on
`main` and ship in the next release rather than being backported.
