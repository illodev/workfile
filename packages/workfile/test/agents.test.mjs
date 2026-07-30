import assert from "node:assert/strict";
import test from "node:test";
import {
    cp,
    mkdtemp,
    readFile,
    rm,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    buildAgentContext,
    checkAgentInstructions,
    createManagedDocument,
    createMemoryRecord,
    loadWorkspace,
    syncAgentInstructions
} from "../dist/src/index.js";

const fixture = resolve(
    fileURLToPath(new URL("./fixtures/workspace", import.meta.url))
);

test("agent adapters preserve user content and detect stale managed blocks", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-agents-"));
    await cp(fixture, root, { recursive: true });
    await writeFile(join(root, "AGENTS.md"), "# Team notes\n\nKeep this paragraph.\n");
    const workspace = await loadWorkspace({ root });
    try {
        const synced = await syncAgentInstructions(workspace, {
            targets: ["agents-md", "cursor"]
        });
        assert.equal(synced.changed, 7);
        const agents = await readFile(join(root, "AGENTS.md"), "utf8");
        assert.match(agents, /# Team notes/);
        assert.match(agents, /workfile:begin kind=adapter-agents-md/);
        assert.match(
            await readFile(
                join(root, ".cursor/rules/workfile.mdc"),
                "utf8"
            ),
            /alwaysApply: true/
        );

        const current = await checkAgentInstructions(workspace, {
            targets: ["agents-md", "cursor"]
        });
        assert.equal(current.ok, true);
        assert.equal(current.counts.current, 7);

        await writeFile(
            join(root, "AGENTS.md"),
            agents.replace("Reglas críticas", "Reglas alteradas")
        );
        const stale = await checkAgentInstructions(workspace, {
            targets: ["agents-md", "cursor"]
        });
        assert.equal(stale.ok, false);
        assert.ok(
            stale.issues.some(
                (issue) =>
                    issue.code === "agent-instructions-stale" &&
                    issue.file === "AGENTS.md"
            )
        );

        await syncAgentInstructions(workspace, {
            targets: ["agents-md", "cursor"]
        });
        const restored = await readFile(join(root, "AGENTS.md"), "utf8");
        assert.match(restored, /# Team notes/);
        assert.match(restored, /Reglas críticas/);
        assert.doesNotMatch(restored, /Reglas alteradas/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("agent context stays bounded and includes related durable knowledge", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-context-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    try {
        const document = await createManagedDocument(workspace, {
            title: "API operating guide",
            kind: "guide",
            status: "current",
            related: ["T-0001"],
            body: "Guidance for API changes."
        });
        const convention = await createMemoryRecord(workspace, "conventions", {
            title: "Run API integration tests",
            status: "active",
            scope: ["apps/api"],
            related: ["T-0001"],
            body: "Run integration tests before review."
        });
        const context = await buildAgentContext(workspace, {
            cardId: "T-0001",
            limit: 10
        });
        assert.equal(context.focus, "T-0001");
        assert.ok(context.records.some((record) => record.id === document.id));
        assert.ok(context.records.some((record) => record.id === convention.id));
        assert.match(context.markdown, /T-0001 — Example task/);
        assert.match(context.markdown, /API operating guide/);
        assert.ok(context.records.length <= 10);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("syncing over nested-era debris sweeps orphan markers", async () => {
    const { mergeManagedBlock, renderManagedBlock, sweepOrphanMarkers } =
        await import("../dist/src/modules/generated/managed-files.js");

    // Unit: ends without a begin are never legitimate content; complete
    // blocks and the author's prose survive untouched.
    const block = renderManagedBlock({
        kind: "demo",
        version: "0.1.3",
        body: "Managed body."
    });
    const debris = [
        "<!-- workfile:end -->",
        "# Prose before.",
        block.text,
        "<!-- workfile:end -->",
        "<!-- workfile:end -->",
        "Prose after.",
        "<!-- workfile:end -->"
    ].join("\n");
    const swept = sweepOrphanMarkers(debris);
    assert.equal((swept.match(/workfile:begin/g) || []).length, 1);
    assert.equal((swept.match(/workfile:end/g) || []).length, 1);
    assert.match(swept, /# Prose before\./);
    assert.match(swept, /Prose after\./);
    const merged = mergeManagedBlock(debris, block);
    assert.equal((merged.match(/workfile:end/g) || []).length, 1);

    // Integration: the exact upgrade path from the card — a file written by
    // the nested-marker era, synced over by the current version.
    const root = await mkdtemp(join(tmpdir(), "workfile-orphans-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    try {
        await syncAgentInstructions(workspace, { targets: ["agents-md"] });
        const clean = await readFile(join(root, "AGENTS.md"), "utf8");
        await writeFile(
            join(root, "AGENTS.md"),
            `# Team notes\n\nKeep this paragraph.\n\n${clean}\n<!-- workfile:end -->\n<!-- workfile:end -->\n<!-- workfile:end -->\n`
        );
        await syncAgentInstructions(workspace, { targets: ["agents-md"] });
        const healed = await readFile(join(root, "AGENTS.md"), "utf8");
        assert.match(healed, /Keep this paragraph\./);
        assert.equal(
            (healed.match(/workfile:begin/g) || []).length,
            (clean.match(/workfile:begin/g) || []).length
        );
        assert.equal(
            (healed.match(/workfile:end/g) || []).length,
            (clean.match(/workfile:end/g) || []).length
        );

        const verdict = await checkAgentInstructions(workspace, {
            targets: ["agents-md"]
        });
        assert.equal(verdict.ok, true);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
