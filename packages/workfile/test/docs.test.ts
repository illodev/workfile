import assert from "node:assert/strict";
import test from "node:test";
import {
    mkdir,
    mkdtemp,
    readFile,
    rm,
    utimes,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    buildProjectIndex,
    createManagedDocument,
    loadDocuments,
    loadManagedDocuments,
    loadWorkspace,
    moveManagedDocument,
    patchManagedDocument,
    searchProjectRecords
} from "../dist/src/index.js";

async function makeWorkspace({ layout } = {}) {
    const root = await mkdtemp(join(tmpdir(), "workfile-docs-"));
    await mkdir(join(root, ".project", "cards", "archive"), { recursive: true });
    await mkdir(join(root, ".project", "docs"), { recursive: true });
    await mkdir(join(root, "docs", "guides"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(
        join(root, "project.config.mjs"),
        `export default {
            schemaVersion: 2,
            name: "Docs fixture",
            cards: { areas: ["api", "docs"] },
            docs: {
                sources: ["README.md", "docs/**/*.md"],${
                    layout ? `\n                layout: ${JSON.stringify(layout)},` : ""
                }
                reviewIntervalDays: 30
            }
        };\n`
    );
    await writeFile(
        join(root, ".project", "VERSION"),
        `${JSON.stringify({ schemaVersion: 2 })}\n`
    );
    await writeFile(
        join(root, "README.md"),
        "# Docs fixture\n\nRepository overview. See the [billing guide](docs/guides/billing.md).\n"
    );
    await writeFile(
        join(root, "docs", "guides", "billing.md"),
        "# Billing guide\n\nHow invoices move through the system.\n"
    );
    await writeFile(join(root, "src", "billing.js"), "export const billing = true;\n");
    await writeFile(
        join(root, ".project", "cards", "T-0001-refresh-docs.md"),
        `---
id: T-0001
title: Refresh billing docs
status: done
type: docs
priority: high
area: docs
source: docs/guides/billing.md
created: 2026-07-01
updated: 2026-07-20
---

The implementation is documented by DOC-0001.
`
    );
    await writeFile(
        join(root, ".project", "docs", "DOC-0001-billing-architecture.md"),
        `---
id: DOC-0001
title: Billing architecture
kind: architecture
status: current
owners: [billing]
related: [T-0001]
scope: [src/billing.js]
created: 2026-06-01
updated: 2026-07-01
reviewed: 2026-07-01
audience: engineers
---

The billing boundary and its invariants.
`
    );
    await utimes(
        join(root, "src", "billing.js"),
        new Date("2026-07-25T00:00:00Z"),
        new Date("2026-07-25T00:00:00Z")
    );
    return root;
}

test("Docs discovers indexed files and normalizes managed records", async () => {
    const root = await makeWorkspace();
    try {
        const workspace = await loadWorkspace({ root });
        const loaded = await loadDocuments(workspace);
        assert.deepEqual(
            loaded.documents.map((document) => document.path),
            [
                ".project/docs/DOC-0001-billing-architecture.md",
                "README.md",
                "docs/guides/billing.md"
            ]
        );
        const managed = loaded.documents.find((document) => document.managed);
        assert.equal(managed.id, "DOC-0001");
        assert.equal(managed.documentKind, "architecture");
        const indexed = loaded.documents.find(
            (document) => document.path === "docs/guides/billing.md"
        );
        assert.match(indexed.id, /^PATH-[A-F0-9]{12}$/);
        assert.equal(indexed.title, "Billing guide");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("Unified index exposes search, backlinks and freshness warnings", async () => {
    const root = await makeWorkspace();
    try {
        const workspace = await loadWorkspace({ root });
        const index = await buildProjectIndex(workspace, {
            diagnose: true,
            now: new Date("2026-09-15T00:00:00Z")
        });
        assert.deepEqual(index.modules, {
            cards: 1,
            docs: 3,
            managedDocs: 1,
            indexedDocs: 2
        });
        const document = index.byId.get("DOC-0001");
        assert.ok(document);
        assert.deepEqual(document.outgoing.map((link) => link.id), ["T-0001"]);
        assert.deepEqual(document.incoming.map((link) => link.id), ["T-0001"]);
        const indexedGuide = index.records.find(
            (record) => record.path === "docs/guides/billing.md"
        );
        assert.equal(indexedGuide.incoming.length, 2);
        assert.ok(indexedGuide.incoming.some((link) => link.id === "T-0001"));
        assert.deepEqual(
            indexedGuide.incoming.map((link) => link.relation).sort(),
            ["markdown", "source"]
        );
        assert.ok(
            document.freshness.some((warning) => warning.code === "doc-source-newer")
        );
        assert.ok(
            document.freshness.some(
                (warning) => warning.code === "doc-related-card-newer"
            )
        );
        assert.ok(
            document.freshness.some(
                (warning) => warning.code === "doc-review-overdue"
            )
        );
        const result = searchProjectRecords(index.records, "billing architecture", {
            kinds: ["doc"]
        });
        assert.equal(result.records[0].id, "DOC-0001");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("Managed document mutations use collision-safe IDs and revisions", async () => {
    const root = await makeWorkspace();
    try {
        const workspace = await loadWorkspace({ root });
        const before = await loadDocuments(workspace);
        const existing = before.documents.find(
            (document) => document.id === "DOC-0001"
        );
        const refreshed = await patchManagedDocument(
            workspace,
            existing.id,
            { reviewed: "2026-07-28" },
            { expectedRevision: existing.revision }
        );
        assert.equal(
            refreshed.document.updated,
            new Date().toISOString().slice(0, 10)
        );
        const refreshedContent = await readFile(refreshed.path, "utf8");
        assert.match(refreshedContent, /audience: engineers/);
        assert.match(
            refreshedContent,
            new RegExp(`updated: ${new Date().toISOString().slice(0, 10)}`)
        );
        const [first, second] = await Promise.all([
            createManagedDocument(workspace, {
                title: "Deployment runbook",
                kind: "runbook",
                status: "current",
                body: "Deploy safely."
            }),
            createManagedDocument(workspace, {
                title: "API guide",
                kind: "guide",
                status: "draft",
                body: "Use the API."
            })
        ]);
        assert.deepEqual(
            [first.id, second.id].sort(),
            ["DOC-0002", "DOC-0003"]
        );
        const updated = await patchManagedDocument(
            workspace,
            first.id,
            {
                status: "current",
                tags: ["deploy"],
                body: "Deploy safely and verify health checks."
            },
            { expectedRevision: first.revision }
        );
        assert.deepEqual(updated.document.tags, ["deploy"]);
        await assert.rejects(
            () =>
                patchManagedDocument(
                    workspace,
                    first.id,
                    { status: "stale" },
                    { expectedRevision: first.revision }
                ),
            (error) => error.code === "DOC_WRITE_CONFLICT"
        );
        const content = await readFile(updated.path, "utf8");
        assert.match(content, /tags: \[deploy\]/);
        assert.match(content, /verify health checks/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

function managedDocument(id, title, kind = "architecture") {
    return `---
id: ${id}
title: ${title}
kind: ${kind}
status: current
created: 2026-07-01
updated: 2026-07-01
---

Body of ${id}.
`;
}

test("Managed documents in folders are loaded, addressable by ID and patchable", async () => {
    const root = await makeWorkspace();
    try {
        await mkdir(join(root, ".project", "docs", "architecture", "billing"), {
            recursive: true
        });
        await writeFile(
            join(
                root,
                ".project",
                "docs",
                "architecture",
                "billing",
                "DOC-0014-nested.md"
            ),
            managedDocument("DOC-0014", "Nested architecture note")
        );
        const workspace = await loadWorkspace({ root });
        const loaded = await loadManagedDocuments(workspace);
        const nested = loaded.documents.find(
            (document) => document.id === "DOC-0014"
        );
        assert.ok(nested, "the nested document is loaded");
        assert.equal(nested.file, "architecture/billing/DOC-0014-nested.md");
        assert.equal(
            nested.path,
            ".project/docs/architecture/billing/DOC-0014-nested.md"
        );
        assert.equal(nested.managed, true);

        const index = await buildProjectIndex(workspace, { diagnose: true });
        assert.equal(index.byId.get("DOC-0014").title, "Nested architecture note");

        const patched = await patchManagedDocument(
            workspace,
            "DOC-0014",
            { status: "stale", tags: ["billing"] },
            { expectedRevision: nested.revision }
        );
        assert.equal(patched.document.status, "stale");
        assert.equal(patched.file, "architecture/billing/DOC-0014-nested.md");
        const content = await readFile(
            join(
                root,
                ".project",
                "docs",
                "architecture",
                "billing",
                "DOC-0014-nested.md"
            ),
            "utf8"
        );
        assert.match(content, /status: stale/);
        assert.match(content, /tags: \[billing\]/);

        // The global sequence sees documents in folders.
        const created = await createManagedDocument(workspace, {
            title: "After the nested document",
            kind: "guide"
        });
        assert.equal(created.id, "DOC-0015");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("docs.layout decides where new documents are written", async () => {
    const byKind = await makeWorkspace({ layout: "kind" });
    const flat = await makeWorkspace({ layout: "flat" });
    try {
        const kindWorkspace = await loadWorkspace({ root: byKind });
        assert.equal(kindWorkspace.schema.docs.layout, "kind");
        const runbook = await createManagedDocument(kindWorkspace, {
            title: "Deployment runbook",
            kind: "runbook"
        });
        assert.equal(runbook.file, `runbook/${runbook.id}-deployment-runbook.md`);
        assert.equal(
            runbook.document.path,
            `.project/docs/runbook/${runbook.id}-deployment-runbook.md`
        );
        await readFile(runbook.path, "utf8");

        const flatWorkspace = await loadWorkspace({ root: flat });
        assert.equal(flatWorkspace.schema.docs.layout, "flat");
        const guide = await createManagedDocument(flatWorkspace, {
            title: "Deployment runbook",
            kind: "runbook"
        });
        assert.equal(guide.file, `${guide.id}-deployment-runbook.md`);
        assert.equal(
            guide.document.path,
            `.project/docs/${guide.id}-deployment-runbook.md`
        );
    } finally {
        await rm(byKind, { recursive: true, force: true });
        await rm(flat, { recursive: true, force: true });
    }
});

test("--folder wins over docs.layout and cannot escape the managed root", async () => {
    const root = await makeWorkspace({ layout: "kind" });
    try {
        const workspace = await loadWorkspace({ root });
        const explicit = await createManagedDocument(workspace, {
            title: "Rate limiting",
            kind: "architecture",
            folder: "adr/2026"
        });
        assert.equal(explicit.file, `adr/2026/${explicit.id}-rate-limiting.md`);

        const forcedRoot = await createManagedDocument(workspace, {
            title: "Protocol overview",
            kind: "architecture",
            folder: ""
        });
        assert.equal(forcedRoot.file, `${forcedRoot.id}-protocol-overview.md`);

        for (const folder of ["../outside", "adr/../../escape", "/etc"]) {
            await assert.rejects(
                () =>
                    createManagedDocument(workspace, {
                        title: "Escaping document",
                        folder
                    }),
                (error) => {
                    assert.equal(error.code, "DOC_FOLDER_INVALID");
                    return true;
                }
            );
        }

        const loaded = await loadManagedDocuments(workspace);
        assert.deepEqual(
            loaded.documents.map((document) => document.id).sort(),
            ["DOC-0001", "DOC-0002", "DOC-0003"]
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("Documents move between folders without changing their ID", async () => {
    const root = await makeWorkspace({ layout: "kind" });
    try {
        const workspace = await loadWorkspace({ root });
        const created = await createManagedDocument(workspace, {
            title: "Payment retries",
            kind: "architecture"
        });
        assert.equal(created.file, `architecture/${created.id}-payment-retries.md`);

        const moved = await moveManagedDocument(workspace, created.id, {
            folder: "architecture/billing",
            expectedRevision: created.revision
        });
        assert.equal(moved.id, created.id);
        assert.equal(
            moved.file,
            `architecture/billing/${created.id}-payment-retries.md`
        );
        assert.equal(moved.revision, created.revision);
        await assert.rejects(() => readFile(created.path, "utf8"), {
            code: "ENOENT"
        });
        const found = (await loadManagedDocuments(workspace)).documents.find(
            (document) => document.id === created.id
        );
        assert.equal(
            found.path,
            `.project/docs/architecture/billing/${created.id}-payment-retries.md`
        );

        const toRoot = await moveManagedDocument(workspace, created.id, {
            folder: ""
        });
        assert.equal(toRoot.file, `${created.id}-payment-retries.md`);
        assert.equal(
            toRoot.document.path,
            `.project/docs/${created.id}-payment-retries.md`
        );

        // Moving to the same folder is a no-op rather than an error.
        const again = await moveManagedDocument(workspace, created.id, {
            folder: "."
        });
        assert.equal(again.path, toRoot.path);

        await assert.rejects(
            () =>
                moveManagedDocument(workspace, created.id, {
                    folder: "../outside"
                }),
            (error) => error.code === "DOC_FOLDER_INVALID"
        );

        await mkdir(join(root, ".project", "docs", "reference"), {
            recursive: true
        });
        await writeFile(
            join(
                root,
                ".project",
                "docs",
                "reference",
                `${created.id}-payment-retries.md`
            ),
            managedDocument("DOC-0099", "Colliding file name", "reference")
        );
        await assert.rejects(
            () =>
                moveManagedDocument(workspace, created.id, {
                    folder: "reference"
                }),
            (error) => error.code === "DOC_MOVE_TARGET_EXISTS"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("Duplicate document IDs are still detected across folders", async () => {
    const root = await makeWorkspace();
    try {
        await mkdir(join(root, ".project", "docs", "architecture"), {
            recursive: true
        });
        await writeFile(
            join(root, ".project", "docs", "architecture", "DOC-0001-copy.md"),
            managedDocument("DOC-0001", "Billing architecture duplicate")
        );
        const workspace = await loadWorkspace({ root });
        const loaded = await loadManagedDocuments(workspace);
        assert.equal(
            loaded.documents.filter((document) => document.id === "DOC-0001")
                .length,
            2
        );
        const index = await buildProjectIndex(workspace, {
            diagnose: true,
            now: new Date("2026-07-10T00:00:00Z")
        });
        assert.ok(
            index.reports.docs.issues.some(
                (issue) =>
                    issue.code === "duplicate-record-id" && issue.id === "DOC-0001"
            )
        );
        await assert.rejects(
            () => patchManagedDocument(workspace, "DOC-0001", { status: "stale" }),
            (error) => error.code === "DOC_ID_AMBIGUOUS"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("Docs doctor reports broken local links and strict supersedes targets", async () => {
    const root = await makeWorkspace();
    try {
        await writeFile(
            join(root, ".project", "docs", "DOC-0002-broken.md"),
            `---
id: DOC-0002
title: Broken references
kind: guide
status: current
supersedes: [DOC-9999]
created: 2026-07-01
updated: 2026-07-01
---

See [missing guide](../../docs/missing.md).
`
        );
        const workspace = await loadWorkspace({ root });
        const index = await buildProjectIndex(workspace, {
            diagnose: true,
            now: new Date("2026-07-10T00:00:00Z")
        });
        const codes = index.reports.docs.issues
            .filter((issue) => issue.id === "DOC-0002")
            .map((issue) => issue.code);
        assert.ok(codes.includes("doc-broken-local-link"));
        assert.ok(codes.includes("doc-missing-superseded"));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// A conflict used to carry only two revision strings, so the only honest thing
// a client could do was discard the edit: it had no way to compare, let alone
// merge. The record as it now stands is right there on the server.
test("a write conflict reports the record as it now stands", async () => {
    const root = await makeWorkspace();
    try {
        const workspace = await loadWorkspace({ root });
        const created = await createManagedDocument(workspace, {
            title: "Contested document",
            body: "Original body."
        });

        // Someone else writes first.
        await patchManagedDocument(workspace, created.id, {
            body: "Their version."
        });

        await assert.rejects(
            () =>
                patchManagedDocument(
                    workspace,
                    created.id,
                    { body: "My version." },
                    { expectedRevision: created.revision }
                ),
            (error) => {
                assert.equal(error.code, "DOC_WRITE_CONFLICT");
                assert.equal(error.details.expectedRevision, created.revision);
                assert.notEqual(
                    error.details.actualRevision,
                    created.revision
                );
                // The whole point: what is on disk, without a second request.
                assert.equal(error.details.current.body.trim(), "Their version.");
                assert.equal(
                    error.details.current.revision,
                    error.details.actualRevision
                );
                assert.equal(error.details.current.id, created.id);
                return true;
            }
        );

        // And a write against the current revision still goes through, so the
        // caller can resolve and retry without reloading everything.
        const { documents } = await loadDocuments(workspace);
        const now = documents.find((document) => document.id === created.id);
        const resolved = await patchManagedDocument(
            workspace,
            created.id,
            { body: "Merged version." },
            { expectedRevision: now.revision }
        );
        assert.equal(resolved.document.body.trim(), "Merged version.");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
