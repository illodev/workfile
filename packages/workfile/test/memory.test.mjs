import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    buildProjectIndex,
    createMemoryRecord,
    graduateLearning,
    loadMemory,
    loadWorkspace,
    patchMemoryRecord,
    supersedeMemoryRecord
} from "../dist/src/index.js";

async function makeWorkspace() {
    const root = await mkdtemp(join(tmpdir(), "workfile-memory-"));
    await mkdir(join(root, ".project", "cards", "archive"), { recursive: true });
    await mkdir(join(root, ".project", "docs"), { recursive: true });
    await writeFile(
        join(root, "project.config.mjs"),
        `export default {
            schemaVersion: 2,
            name: "Memory fixture",
            cards: { areas: ["api", "infra"] },
            docs: { sources: ["README.md"] }
        };\n`
    );
    await writeFile(
        join(root, ".project", "VERSION"),
        `${JSON.stringify({ schemaVersion: 2 })}\n`
    );
    await writeFile(join(root, "README.md"), "# Memory fixture\n");
    await writeFile(
        join(root, ".project", "cards", "T-0001-verify-release.md"),
        `---
id: T-0001
title: Verify release
status: done
type: task
priority: high
area: infra
created: 2026-07-20
updated: 2026-07-28
---

Verify in a running environment.
`
    );
    return root;
}

test("Memory collections create typed records with independent sequences", async () => {
    const root = await makeWorkspace();
    try {
        const workspace = await loadWorkspace({ root });
        const learning = await createMemoryRecord(workspace, "learnings", {
            title: "Verify deployments before closing work",
            status: "active",
            category: "delivery",
            confidence: "high",
            occurrences: 3,
            related: ["T-0001"],
            body: "A merged change is not necessarily deployed."
        });
        const decision = await createMemoryRecord(workspace, "decisions", {
            title: "Keep project data in Markdown",
            status: "accepted",
            deciders: ["owner"],
            body: "## Decision\n\nMarkdown remains canonical."
        });
        const convention = await createMemoryRecord(workspace, "conventions", {
            title: "Verify user-visible changes",
            status: "active",
            scope: ["project-wide"],
            body: "Keep cards in review until runtime verification."
        });
        assert.equal(learning.id, "LRN-0001");
        assert.equal(decision.id, "ADR-0001");
        assert.equal(convention.id, "CONV-0001");

        const graduated = await graduateLearning(
            workspace,
            learning.id,
            [convention.id],
            { expectedRevision: learning.revision }
        );
        assert.equal(graduated.record.status, "graduated");
        assert.deepEqual(graduated.record.graduated_to, ["CONV-0001"]);

        const loaded = await loadMemory(workspace);
        assert.equal(loaded.records.length, 3);
        const index = await buildProjectIndex(workspace, { diagnose: true });
        assert.equal(index.modules.memory, 3);
        assert.ok(
            index.byId
                .get("LRN-0001")
                .outgoing.some((link) => link.id === "CONV-0001")
        );
        assert.equal(index.reports.memory.counts.error, 0);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("Memory patches reject stale revisions and supersession links both records", async () => {
    const root = await makeWorkspace();
    try {
        const workspace = await loadWorkspace({ root });
        const oldDecision = await createMemoryRecord(workspace, "decisions", {
            title: "Use JSON as canonical storage",
            status: "accepted",
            body: "Initial decision."
        });
        const replacement = await createMemoryRecord(workspace, "decisions", {
            title: "Use Markdown as canonical storage",
            status: "accepted",
            body: "Replacement decision."
        });
        const patched = await patchMemoryRecord(
            workspace,
            oldDecision.id,
            { tags: ["storage"] },
            { expectedRevision: oldDecision.revision }
        );
        await assert.rejects(
            () =>
                patchMemoryRecord(
                    workspace,
                    oldDecision.id,
                    { title: "Stale edit" },
                    { expectedRevision: oldDecision.revision }
                ),
            (error) => error.code === "MEMORY_WRITE_CONFLICT"
        );
        const superseded = await supersedeMemoryRecord(
            workspace,
            oldDecision.id,
            replacement.id,
            { expectedRevision: patched.revision }
        );
        assert.equal(superseded.record.status, "superseded");
        assert.deepEqual(superseded.record.superseded_by, ["ADR-0002"]);
        const loaded = await loadMemory(workspace);
        const next = loaded.records.find((record) => record.id === "ADR-0002");
        assert.deepEqual(next.supersedes, ["ADR-0001"]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("Memory records in collection subfolders load, patch and keep the sequence", async () => {
    const root = await makeWorkspace();
    try {
        await mkdir(join(root, ".project", "memory", "decisions", "2026", "q3"), {
            recursive: true
        });
        await writeFile(
            join(
                root,
                ".project",
                "memory",
                "decisions",
                "2026",
                "q3",
                "ADR-0009-nested.md"
            ),
            `---
id: ADR-0009
title: Group decisions by quarter
status: accepted
created: 2026-07-01
updated: 2026-07-01
---

Folders are organization, not identity.
`
        );
        const workspace = await loadWorkspace({ root });
        const loaded = await loadMemory(workspace);
        const nested = loaded.records.find((record) => record.id === "ADR-0009");
        assert.ok(nested, "the nested memory record is loaded");
        assert.equal(nested.collection, "decisions");
        assert.equal(nested.file, "2026/q3/ADR-0009-nested.md");
        assert.equal(
            nested.path,
            ".project/memory/decisions/2026/q3/ADR-0009-nested.md"
        );

        const patched = await patchMemoryRecord(
            workspace,
            "ADR-0009",
            { tags: ["governance"] },
            { expectedRevision: nested.revision }
        );
        assert.deepEqual(patched.record.tags, ["governance"]);

        const created = await createMemoryRecord(workspace, "decisions", {
            title: "Keep the sequence global",
            status: "accepted"
        });
        assert.equal(created.id, "ADR-0010");

        const index = await buildProjectIndex(workspace, { diagnose: true });
        assert.equal(index.byId.get("ADR-0009").title, "Group decisions by quarter");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("Memory doctor flags expired context and incomplete incident resolution", async () => {
    const root = await makeWorkspace();
    try {
        const workspace = await loadWorkspace({ root });
        await createMemoryRecord(
            workspace,
            "context",
            {
                title: "Billing migration freeze",
                status: "active",
                expires: "2026-08-15",
                body: "Do not deploy billing migrations."
            },
            { now: "2026-07-28T00:00:00Z" }
        );
        await createMemoryRecord(
            workspace,
            "incidents",
            {
                title: "Deployment marked complete too early",
                status: "resolved",
                severity: "high",
                started_at: "2026-07-26T11:04:00Z",
                body: "## Root cause\n\nVerification was skipped."
            },
            { now: "2026-07-28T00:00:00Z" }
        );
        const index = await buildProjectIndex(workspace, {
            diagnose: true,
            now: new Date("2026-09-01T00:00:00Z")
        });
        const codes = index.reports.memory.issues.map((issue) => issue.code);
        assert.ok(codes.includes("context-expired-active"));
        assert.ok(codes.includes("incident-resolution-time-missing"));
        assert.ok(codes.includes("incident-corrective-actions-missing"));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
