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
    createCard,
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
        // Provenance is asserted in both directions from the same bundle,
        // because only one of them can be read off the focus card. `Came out
        // of` is its own `origin` field; `Spawned` has to be found by scanning
        // every other card for one naming it, and a bundle that reported only
        // the first would look correct from the card that declared the edge.
        const spawned = await createCard(workspace, {
            title: "Found while working the example",
            area: "api",
            origin: ["T-0001"]
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
        // Asserted on `provenance` rather than on the rendered line, because
        // this fixture declares `language: "es"` and the markdown renders
        // `**Ha generado**`. The structure is the contract; the wording is
        // localized, and pinning it here would make the bundle the one place a
        // language change breaks a test.
        assert.deepEqual(context.provenance, { origin: [], spawned: [spawned.id] });
        assert.match(context.markdown, new RegExp(`: ${spawned.id}$`, "m"));

        const child = await buildAgentContext(workspace, {
            cardId: spawned.id,
            limit: 10
        });
        assert.deepEqual(child.provenance, { origin: ["T-0001"], spawned: [] });
        assert.match(child.markdown, /: T-0001$/m);
        assert.ok(context.records.length <= 10);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * The protocol must not teach an actor invented by hand.
 *
 * It taught `card claim ID --actor ACTOR` and `--actor session-id` in four
 * places, and an invented actor arms the edit guard against the session that
 * invented it: the `PreToolUse` hook derives its own identity and compares, so
 * it asks about your own claim on every write, and `card release` then refuses
 * with `CARD_CLAIM_OWNER_MISMATCH`. See claude-surface.test.ts, "the guard is
 * silent for the session that holds the claim", for the behaviour itself.
 *
 * Both languages, because the protocol exists twice and the fixture renders
 * one. Fixing only the branch a test happens to exercise is how the English
 * copy would have kept teaching it.
 *
 * Every file the sync writes, because AGENTS.md is a fourteen-line pointer and
 * the text an agent reads is `.project/agents/protocol.md` and the workflows.
 */
test("no generated instruction teaches an actor the guard will not recognize", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-actor-docs-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    try {
        for (const language of ["es", "en"]) {
            workspace.config.language = language;
            const synced = await syncAgentInstructions(workspace, {
                targets: ["agents-md"]
            });
            for (const file of synced.files) {
                assert.doesNotMatch(
                    await readFile(join(root, file.path), "utf8"),
                    /card claim[^\n`]*--actor/,
                    `${file.path} teaches a hand-invented actor in ${language}`
                );
            }
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a scoped record is filtered against a known scope, never against an absent one", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-scope-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    try {
        // Related to nothing, so the collection filter is the only way in. The
        // sibling test above reaches its convention through `related`, which is
        // exactly what hid this for as long as it did.
        const api = await createMemoryRecord(workspace, "decisions", {
            title: "Postgres over SQLite for the API",
            status: "accepted",
            scope: ["apps/api"],
            body: "We chose Postgres."
        });
        const www = await createMemoryRecord(workspace, "decisions", {
            title: "Tailwind for the marketing site",
            status: "accepted",
            scope: ["apps/www"],
            body: "We chose Tailwind."
        });
        const unscoped = await createMemoryRecord(workspace, "decisions", {
            title: "Semver for every package",
            status: "accepted",
            body: "We follow semver."
        });
        const ids = (context) => new Set(context.records.map((record) => record.id));

        // Session start: no card, so no scope to compare against. Excluding
        // here is a decision an agent must not contradict, made invisible.
        const opening = ids(await buildAgentContext(workspace, { limit: 20 }));
        assert.ok(opening.has(api.id));
        assert.ok(opening.has(www.id));
        assert.ok(opening.has(unscoped.id));

        // A focus card that declares no scope is the same absence of a
        // comparison, and `--card` must not turn "unknown" into "no".
        const scopeless = ids(
            await buildAgentContext(workspace, { cardId: "T-0001", limit: 20 })
        );
        assert.ok(scopeless.has(api.id));
        assert.ok(scopeless.has(www.id));

        // A focus card that does declare one is a comparison, and it filters.
        const card = await createCard(workspace, {
            title: "Rework the API pagination",
            type: "task",
            area: "api",
            scope: ["apps/api"],
            body: "Body.\n\n## Acceptance criteria\n\n- [ ] Verifiable check\n"
        });
        const focused = await buildAgentContext(workspace, {
            cardId: card.id,
            limit: 20
        });
        const matching = ids(focused);
        assert.ok(matching.has(api.id));
        assert.ok(!matching.has(www.id), "a foreign scope is still excluded");
        assert.ok(matching.has(unscoped.id), "an unscoped record is universal");

        // Inclusion without the scope on show is its own quiet lie: a reader
        // has to be able to discard `apps/www` deliberately.
        assert.match(focused.markdown, /_scope: apps\/api_/);
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
