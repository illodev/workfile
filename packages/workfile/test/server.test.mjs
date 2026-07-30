import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";

import { loadWorkspace, startProjectServer } from "../dist/src/index.js";

const fixture = resolve(
    fileURLToPath(new URL("./fixtures/workspace", import.meta.url))
);

test("v2 HTTP API delivers runtime schema and conflict-aware mutations", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-server-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    const running = await startProjectServer(workspace, { port: 0 });
    try {
        const schemaResponse = await fetch(`${running.url}/api/v2/schema`);
        assert.equal(schemaResponse.status, 200);
        const schema = await schemaResponse.json();
        assert.deepEqual(schema.cards.areas, ["api", "web", "infra", "docs"]);

        const recordResponse = await fetch(
            `${running.url}/api/v2/records/T-0001`
        );
        assert.equal(recordResponse.status, 200);
        const etag = recordResponse.headers.get("etag");
        const before = await recordResponse.json();
        assert.equal(before.record.kind, "card");
        assert.ok(before.record.revision.startsWith("sha256:"));

        const patchResponse = await fetch(
            `${running.url}/api/v2/cards/T-0001`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "If-Match": etag
                },
                body: JSON.stringify({ changes: { priority: "high" } })
            }
        );
        assert.equal(patchResponse.status, 200);
        const saved = await patchResponse.json();
        assert.equal(saved.record.priority, "high");

        const conflictResponse = await fetch(
            `${running.url}/api/v2/cards/T-0001`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "If-Match": etag
                },
                body: JSON.stringify({ changes: { priority: "low" } })
            }
        );
        assert.equal(conflictResponse.status, 409);
        const conflict = await conflictResponse.json();
        assert.equal(conflict.error.code, "CARD_WRITE_CONFLICT");

        const claimResponse = await fetch(
            `${running.url}/api/v2/cards/T-0001/claim`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    actor: "server-test",
                    scope: ["apps/api"]
                })
            }
        );
        assert.equal(claimResponse.status, 200);
        const claim = await claimResponse.json();
        assert.equal(claim.record.status, "doing");
        assert.equal(claim.record.claimed_by, "server-test");
    } finally {
        await running.close();
        await rm(root, { recursive: true, force: true });
    }
});

test("legacy task API delegates to v2 services", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-legacy-api-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    const running = await startProjectServer(workspace, { port: 0 });
    try {
        const response = await fetch(`${running.url}/api/tasks/T-0001`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "doing" })
        });
        assert.equal(response.status, 200);
        const tasks = await fetch(`${running.url}/api/tasks`).then((result) =>
            result.json()
        );
        const card = tasks.tasks.find((item) => item.id === "T-0001");
        assert.equal(card.status, "doing");
        assert.equal(card.claimed_by, "ui-local");
    } finally {
        await running.close();
        await rm(root, { recursive: true, force: true });
    }
});

test("legacy API exposes configured schema and persists card assets", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-assets-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    const running = await startProjectServer(workspace, { port: 0 });
    try {
        const initialResponse = await fetch(`${running.url}/api/tasks`);
        assert.equal(initialResponse.status, 200);
        const initial = await initialResponse.json();
        assert.equal(initial.projectName, "Golden workspace");
        assert.deepEqual(initial.schema.cards.areas, [
            "api",
            "web",
            "infra",
            "docs"
        ]);

        const upload = await fetch(
            `${running.url}/api/tasks/T-0001/assets?name=${encodeURIComponent("proof note.txt")}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/octet-stream" },
                body: Buffer.from("verified asset", "utf8")
            }
        );
        assert.equal(upload.status, 201);
        assert.deepEqual(await upload.json(), {
            ok: true,
            name: "proof note.txt"
        });

        const download = await fetch(
            `${running.url}/assets/T-0001/${encodeURIComponent("proof note.txt")}`
        );
        assert.equal(download.status, 200);
        assert.match(download.headers.get("content-type") || "", /^text\/plain/);
        assert.equal(await download.text(), "verified asset");

        const refreshed = await fetch(`${running.url}/api/tasks`).then(
            (response) => response.json()
        );
        const card = refreshed.tasks.find((item) => item.id === "T-0001");
        assert.deepEqual(card.assets, ["proof note.txt"]);
    } finally {
        await running.close();
        await rm(root, { recursive: true, force: true });
    }
});

test("HTTP server serves a precompiled UI directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-static-"));
    const uiDir = await mkdtemp(join(tmpdir(), "workfile-ui-"));
    await cp(fixture, root, { recursive: true });
    await mkdir(join(uiDir, "static"), { recursive: true });
    await writeFile(
        join(uiDir, "index.html"),
        '<!doctype html><main id="app">Workfile UI</main>',
        "utf8"
    );
    await writeFile(join(uiDir, "static", "app.js"), "globalThis.ready = true;", "utf8");
    const workspace = await loadWorkspace({ root });
    const running = await startProjectServer(workspace, { port: 0, uiDir });
    try {
        const index = await fetch(running.url);
        assert.equal(index.status, 200);
        assert.match(index.headers.get("content-type") || "", /^text\/html/);
        assert.match(await index.text(), /Workfile UI/);

        const asset = await fetch(`${running.url}/static/app.js`);
        assert.equal(asset.status, 200);
        assert.match(asset.headers.get("content-type") || "", /javascript/);
        assert.equal(await asset.text(), "globalThis.ready = true;");
    } finally {
        await running.close();
        await rm(root, { recursive: true, force: true });
        await rm(uiDir, { recursive: true, force: true });
    }
});

test("v2 Docs API exposes indexed docs, managed mutations and unified search", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-docs-api-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    const running = await startProjectServer(workspace, { port: 0 });
    try {
        const docsResponse = await fetch(`${running.url}/api/v2/docs`);
        assert.equal(docsResponse.status, 200);
        const docs = await docsResponse.json();
        assert.ok(
            docs.records.some(
                (record) =>
                    record.kind === "doc" &&
                    record.path === "docs/architecture.md" &&
                    record.managed === false
            )
        );

        const createResponse = await fetch(`${running.url}/api/v2/docs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "API architecture",
                kind: "architecture",
                status: "current",
                related: ["T-0001"],
                body: "The API boundary."
            })
        });
        assert.equal(createResponse.status, 201);
        const etag = createResponse.headers.get("etag");
        const created = await createResponse.json();
        assert.equal(created.record.id, "DOC-0001");
        assert.equal(created.record.managed, true);

        const readResponse = await fetch(
            `${running.url}/api/v2/records/${created.record.id}`
        );
        assert.equal(readResponse.status, 200);
        const read = await readResponse.json();
        assert.equal(read.record.title, "API architecture");
        assert.deepEqual(read.record.outgoing.map((link) => link.id), ["T-0001"]);

        const patchResponse = await fetch(
            `${running.url}/api/v2/docs/${created.record.id}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "If-Match": etag
                },
                body: JSON.stringify({ changes: { tags: ["api", "architecture"] } })
            }
        );
        assert.equal(patchResponse.status, 200);
        const patched = await patchResponse.json();
        assert.deepEqual(patched.record.tags, ["api", "architecture"]);

        const conflictResponse = await fetch(
            `${running.url}/api/v2/docs/${created.record.id}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "If-Match": etag
                },
                body: JSON.stringify({ changes: { status: "stale" } })
            }
        );
        assert.equal(conflictResponse.status, 409);
        assert.equal((await conflictResponse.json()).error.code, "DOC_WRITE_CONFLICT");

        const searchResponse = await fetch(
            `${running.url}/api/v2/search?q=${encodeURIComponent("API architecture")}&kind=doc`
        );
        assert.equal(searchResponse.status, 200);
        const search = await searchResponse.json();
        assert.equal(search.records[0].id, created.record.id);
    } finally {
        await running.close();
        await rm(root, { recursive: true, force: true });
    }
});

test("v2 History and Memory APIs share records, revisions and backlinks", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-history-api-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    const running = await startProjectServer(workspace, { port: 0 });
    try {
        const changeResponse = await fetch(`${running.url}/api/v2/changelog`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Expose unified History API",
                type: "added",
                area: "infra",
                visibility: "public",
                cards: ["T-0001"],
                body: "History records use the same project index."
            })
        });
        assert.equal(changeResponse.status, 201);
        const changeEtag = changeResponse.headers.get("etag");
        const change = (await changeResponse.json()).record;
        assert.equal(change.id, "CHG-0001");
        assert.deepEqual(change.cards, ["T-0001"]);

        const indexedCreatedChange = await fetch(
            `${running.url}/api/v2/records/${change.id}`
        ).then((response) => response.json());
        assert.deepEqual(
            indexedCreatedChange.record.outgoing.map((link) => link.id),
            ["T-0001"]
        );

        const patchResponse = await fetch(
            `${running.url}/api/v2/changelog/${change.id}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "If-Match": changeEtag
                },
                body: JSON.stringify({ changes: { tags: ["history", "api"] } })
            }
        );
        assert.equal(patchResponse.status, 200);
        const patchedChange = (await patchResponse.json()).record;
        assert.deepEqual(patchedChange.tags, ["history", "api"]);

        const stalePatch = await fetch(
            `${running.url}/api/v2/changelog/${change.id}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "If-Match": changeEtag
                },
                body: JSON.stringify({ changes: { type: "fixed" } })
            }
        );
        assert.equal(stalePatch.status, 409);
        assert.equal((await stalePatch.json()).error.code, "CHANGE_WRITE_CONFLICT");

        const previewResponse = await fetch(
            `${running.url}/api/v2/changelog/releases/preview`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fragmentIds: [change.id] })
            }
        );
        assert.equal(previewResponse.status, 200);
        const preview = await previewResponse.json();
        assert.equal(preview.fragments[0].id, change.id);

        const releaseResponse = await fetch(
            `${running.url}/api/v2/changelog/releases`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    version: "0.4.0",
                    title: "History and Memory",
                    fragmentIds: [change.id]
                })
            }
        );
        assert.equal(releaseResponse.status, 201);
        const release = (await releaseResponse.json()).record;
        assert.equal(release.id, "REL-0001");
        assert.deepEqual(release.fragments, [change.id]);

        const conventionResponse = await fetch(`${running.url}/api/v2/memory`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                collection: "conventions",
                title: "Keep operational knowledge in canonical records",
                status: "active",
                related: ["T-0001"]
            })
        });
        assert.equal(conventionResponse.status, 201);
        const convention = (await conventionResponse.json()).record;
        assert.equal(convention.id, "CONV-0001");

        const learningResponse = await fetch(`${running.url}/api/v2/memory`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                collection: "learnings",
                title: "One index makes cross-domain backlinks cheap",
                status: "active",
                confidence: "high",
                related: [change.id]
            })
        });
        assert.equal(learningResponse.status, 201);
        const learningEtag = learningResponse.headers.get("etag");
        const learning = (await learningResponse.json()).record;
        assert.equal(learning.id, "LRN-0001");

        const graduateResponse = await fetch(
            `${running.url}/api/v2/memory/${learning.id}/graduate`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "If-Match": learningEtag
                },
                body: JSON.stringify({ targets: [convention.id] })
            }
        );
        assert.equal(graduateResponse.status, 200);
        const graduated = (await graduateResponse.json()).record;
        assert.equal(graduated.status, "graduated");
        assert.deepEqual(graduated.graduated_to, [convention.id]);

        const indexedChange = await fetch(
            `${running.url}/api/v2/records/${change.id}`
        ).then((response) => response.json());
        assert.ok(
            indexedChange.record.incoming.some((link) => link.id === learning.id)
        );

        const memorySearch = await fetch(
            `${running.url}/api/v2/search?q=${encodeURIComponent("cross-domain backlinks")}&kind=memory`
        ).then((response) => response.json());
        assert.equal(memorySearch.records[0].id, learning.id);

        const rendered = await fetch(
            `${running.url}/api/v2/changelog/render?visibility=public`
        ).then((response) => response.json());
        assert.match(rendered.content, /0\.4\.0/);
        assert.match(rendered.content, /Expose unified History API/);
    } finally {
        await running.close();
        await rm(root, { recursive: true, force: true });
    }
});

test("v2 Agents API synchronizes adapters and returns bounded card context", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-agents-api-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    const running = await startProjectServer(workspace, { port: 0 });
    try {
        const beforeResponse = await fetch(`${running.url}/api/v2/agents`);
        assert.equal(beforeResponse.status, 200);
        const before = await beforeResponse.json();
        assert.equal(before.ok, false);
        assert.ok(before.counts.missing > 0);

        const syncResponse = await fetch(`${running.url}/api/v2/agents/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targets: ["agents-md"] })
        });
        assert.equal(syncResponse.status, 200);
        const synced = await syncResponse.json();
        assert.equal(synced.targets[0], "agents-md");
        assert.ok(synced.changed > 0);

        const current = await fetch(`${running.url}/api/v2/agents`).then(
            (response) => response.json()
        );
        assert.equal(current.ok, true);

        const contextResponse = await fetch(
            `${running.url}/api/v2/agents/context?card=T-0001&limit=5`
        );
        assert.equal(contextResponse.status, 200);
        const context = await contextResponse.json();
        assert.equal(context.focus, "T-0001");
        assert.equal(context.records[0].id, "T-0001");
        assert.ok(context.records.length <= 5);

        const ciResponse = await fetch(`${running.url}/api/v2/ci/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targets: ["generic"] })
        });
        assert.equal(ciResponse.status, 200);
        const ci = await ciResponse.json();
        assert.equal(ci.files[0].path, ".project/ci/workfile.sh");
    } finally {
        await running.close();
        await rm(root, { recursive: true, force: true });
    }
});

// The local server holds unauthenticated read and write access to the
// repository, so the browser's own origin rules are the whole security model.
// Each case below is a vector that was reproducible before the entry guard.
test("the entry guard refuses cross-origin, rebound and simple-request writes", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-guard-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    const running = await startProjectServer(workspace, { port: 0 });

    // `fetch` silently drops a manually set Host, so rebinding needs a socket.
    const rawGet = (host, path = "/api/tasks") =>
        new Promise((done) => {
            const socket = connect(running.port, "127.0.0.1", () => {
                socket.write(
                    `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`
                );
            });
            let buffer = "";
            socket.on("data", (chunk) => (buffer += chunk));
            socket.on("end", () => done(buffer.split("\r\n")[0]));
        });

    try {
        // DNS rebinding: an attacker page on the same origin could otherwise
        // read every record body in the workspace.
        assert.match(await rawGet("attacker.example.com"), /^HTTP\/1\.1 403/);
        assert.match(await rawGet(`127.0.0.1:${running.port}`), /^HTTP\/1\.1 200/);
        assert.match(await rawGet("127.0.0.1:1"), /^HTTP\/1\.1 403/);

        // A cross-origin write, whether or not it declares JSON.
        for (const headers of [
            { "Content-Type": "application/json", Origin: "https://evil.example" },
            { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" }
        ]) {
            const response = await fetch(`${running.url}/api/v2/cards`, {
                method: "POST",
                headers,
                body: JSON.stringify({ title: "Rejected", area: "api" })
            });
            assert.equal(response.status, 403);
            assert.equal(
                (await response.json()).error.code,
                "REQUEST_ORIGIN_FORBIDDEN"
            );
        }

        // CORS-simple content types skip preflight, so they are refused on any
        // mutating route — including the ones that take a raw body.
        for (const type of [
            "text/plain;charset=UTF-8",
            "application/x-www-form-urlencoded"
        ]) {
            const response = await fetch(`${running.url}/api/v2/cards`, {
                method: "POST",
                headers: { "Content-Type": type },
                body: JSON.stringify({ title: "Rejected", area: "api" })
            });
            assert.equal(response.status, 415);
            assert.equal(
                (await response.json()).error.code,
                "REQUEST_CONTENT_TYPE_INVALID"
            );
        }

        // A same-origin request from the bundled UI still works.
        const allowed = await fetch(`${running.url}/api/v2/cards`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Origin: running.url,
                "Sec-Fetch-Site": "same-origin"
            },
            body: JSON.stringify({ title: "Accepted", area: "api" })
        });
        assert.equal(allowed.status, 201);
    } finally {
        await running.close();
        await rm(root, { recursive: true, force: true });
    }
});

test("uploaded assets can never execute in the API origin", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-assets-xss-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    const running = await startProjectServer(workspace, { port: 0 });
    const upload = (name, body) =>
        fetch(
            `${running.url}/api/tasks/T-0001/assets?name=${encodeURIComponent(name)}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/octet-stream" },
                body
            }
        );

    try {
        // Refused at rest, so a future change to the serving rules cannot
        // resurrect the vector on files that are already on disk.
        for (const name of ["pwned.html", "pwned.svg", "pwned.mjs"]) {
            const response = await upload(name, "<script>alert(1)</script>");
            assert.equal(response.status, 400);
            assert.equal(
                (await response.json()).error.code,
                "ASSET_TYPE_NOT_ALLOWED"
            );
        }

        assert.equal((await upload("note.txt", "safe")).status, 201);
        const served = await fetch(`${running.url}/assets/T-0001/note.txt`);
        assert.equal(served.headers.get("x-content-type-options"), "nosniff");
        assert.match(served.headers.get("content-disposition"), /^inline/);
        assert.equal(
            served.headers.get("content-security-policy"),
            "default-src 'none'; sandbox"
        );

        // An extension with no inline mapping downloads instead of rendering.
        assert.equal((await upload("archive.bin", "data")).status, 201);
        const opaque = await fetch(`${running.url}/assets/T-0001/archive.bin`);
        assert.equal(
            opaque.headers.get("content-type"),
            "application/octet-stream"
        );
        assert.match(opaque.headers.get("content-disposition"), /^attachment/);
    } finally {
        await running.close();
        await rm(root, { recursive: true, force: true });
    }
});

// Read-only used to be enforced by four private copies of the same guard, so
// the three write paths that never got one silently ignored it.
test("read-only is enforced on every mutating route, not just record writes", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-readonly-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    workspace.readOnly = true;
    const running = await startProjectServer(workspace, { port: 0 });
    const json = (path, body) =>
        fetch(`${running.url}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

    try {
        const routes = [
            ["/api/v2/cards", { title: "Blocked", area: "api" }],
            ["/api/v2/agents/sync", {}],
            ["/api/v2/ci/sync", {}]
        ];
        for (const [path, body] of routes) {
            const response = await json(path, body);
            assert.equal(response.status, 409, `${path} should refuse writes`);
            assert.equal(
                (await response.json()).error.code,
                "WORKSPACE_READ_ONLY",
                path
            );
        }

        const asset = await fetch(
            `${running.url}/api/tasks/T-0001/assets?name=blocked.txt`,
            {
                method: "POST",
                headers: { "Content-Type": "application/octet-stream" },
                body: "nope"
            }
        );
        assert.equal(asset.status, 409);
        assert.equal(
            (await asset.json()).error.code,
            "WORKSPACE_READ_ONLY"
        );
    } finally {
        await running.close();
        await rm(root, { recursive: true, force: true });
    }
});

// The UI polls the whole card corpus every thirty seconds. The server emitted
// ETags on fourteen routes and read `If-None-Match` on none, answered
// `Cache-Control: no-store` (which forbids even revalidation), and ignored
// `Accept-Encoding` entirely — so the steady state, which is almost always
// "nothing changed", cost megabytes of JSON both ways.
test("collection reads revalidate and compress", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-conditional-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    const running = await startProjectServer(workspace, { port: 0 });

    const hit = async (path, headers = {}) => {
        const response = await fetch(`${running.url}${path}`, { headers });
        await response.arrayBuffer();
        return {
            status: response.status,
            etag: response.headers.get("etag"),
            encoding: response.headers.get("content-encoding"),
            cacheControl: response.headers.get("cache-control"),
            vary: response.headers.get("vary")
        };
    };

    try {
        for (const path of ["/api/tasks", "/api/v2/records?limit=50"]) {
            const first = await hit(path);
            assert.equal(first.status, 200, path);
            assert.ok(first.etag, `${path} must carry an ETag`);
            // `no-store` would forbid the 304 below outright.
            assert.equal(first.cacheControl, "no-cache", path);

            const repeat = await hit(path, { "If-None-Match": first.etag });
            assert.equal(repeat.status, 304, `${path} should revalidate`);
            assert.equal(repeat.etag, first.etag);

            // A weak validator is still the same representation.
            const weak = await hit(path, { "If-None-Match": `W/${first.etag}` });
            assert.equal(weak.status, 304, path);

            // And a stale one must not be honoured.
            const stale = await hit(path, { "If-None-Match": '"nope"' });
            assert.equal(stale.status, 200, path);
        }

        // The ETag tracks content: writing a card invalidates it.
        const before = await hit("/api/tasks");
        await fetch(`${running.url}/api/v2/cards`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "Changes the tag", area: "api" })
        });
        const after = await hit("/api/tasks", { "If-None-Match": before.etag });
        assert.equal(after.status, 200, "a new card must not revalidate as 304");
        assert.notEqual(after.etag, before.etag);
    } finally {
        await running.close();
        await rm(root, { recursive: true, force: true });
    }
});

test("large JSON responses are gzipped only when the client asks", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-gzip-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    const running = await startProjectServer(workspace, { port: 0 });
    try {
        for (let index = 0; index < 60; index += 1) {
            await fetch(`${running.url}/api/v2/cards`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: `Padding card ${index} with a body long enough to matter`,
                    area: "api",
                    body: "lorem ipsum ".repeat(40)
                })
            });
        }

        const plain = await fetch(`${running.url}/api/tasks`, {
            headers: { "Accept-Encoding": "identity" }
        });
        await plain.arrayBuffer();
        const compressed = await fetch(`${running.url}/api/tasks`, {
            headers: { "Accept-Encoding": "gzip" }
        });
        await compressed.arrayBuffer();

        assert.equal(plain.headers.get("content-encoding"), null);
        assert.equal(compressed.headers.get("content-encoding"), "gzip");
        assert.equal(compressed.headers.get("vary"), "Accept-Encoding");

        const before = Number(plain.headers.get("content-length"));
        const after = Number(compressed.headers.get("content-length"));
        assert.ok(before > 10_000, `payload should be substantial, was ${before}`);
        assert.ok(
            after < before / 3,
            `gzip should be a large win, ${after} against ${before}`
        );

        // Small responses stay uncompressed: framing would cost more.
        const small = await fetch(`${running.url}/api/v2/workspace`, {
            headers: { "Accept-Encoding": "gzip" }
        });
        await small.arrayBuffer();
        assert.equal(small.headers.get("content-encoding"), null);
    } finally {
        await running.close();
        await rm(root, { recursive: true, force: true });
    }
});
