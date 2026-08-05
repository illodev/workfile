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
    patchCard,
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
            agents.replace("Critical rules", "Altered rules")
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
        assert.match(restored, /Critical rules/);
        assert.doesNotMatch(restored, /Altered rules/);
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
        // Asserted on `provenance` as well as on the line, because the
        // structure is the contract and the wording is not. It used to be the
        // only assertion available: the fixture declared `language: "es"` and
        // the bundle rendered `**Ha generado**` until ADR-0012 removed the
        // localized surface.
        assert.deepEqual(context.provenance, { origin: [], spawned: [spawned.id] });
        assert.match(context.markdown, /\*\*Spawned\*\*: /);
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
 * This ran twice, once per language, because the protocol existed twice and a
 * fix to one copy left the other teaching it. ADR-0012 removed the second copy.
 *
 * Every file the sync writes, because AGENTS.md is a fourteen-line pointer and
 * the text an agent reads is `.project/agents/protocol.md` and the workflows.
 */
test("no generated instruction teaches an actor the guard will not recognize", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-actor-docs-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    try {
        const synced = await syncAgentInstructions(workspace, {
            targets: ["agents-md"]
        });
        for (const file of synced.files) {
            assert.doesNotMatch(
                await readFile(join(root, file.path), "utf8"),
                /card claim[^\n`]*--actor/,
                `${file.path} teaches a hand-invented actor`
            );
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

/**
 * The bundle every card opens with, and the reason DOC-0005 called this the
 * finding most worth fixing.
 *
 * `scopeMatches` was the filter and could not be one: it returns true whenever
 * either side declares no scope, `memory add` sets none, and most cards carry
 * none either — so two unrelated cards received an identical bundle and the
 * record cap was the only thing bounding it. `protocol.md` line 12 tells agents
 * to load the smallest relevant context, and the command implementing that rule
 * was the one breaking it.
 */
test("two unrelated cards get different bundles out of unscoped memory", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-relevance-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    try {
        const render = await createCard(workspace, {
            title: "The render loop drops frames above 60 Hz",
            type: "bug",
            area: "api"
        });
        const locomotion = await createCard(workspace, {
            title: "Locomotion model for the player character",
            type: "task",
            area: "api"
        });
        // Not one of these declares a scope, which is the ordinary case and
        // the one the old filter could say nothing about.
        const frames = await createMemoryRecord(workspace, "learnings", {
            title: "The render loop budget is 16ms per frame",
            body: "Anything above it drops frames."
        });
        const rootMotion = await createMemoryRecord(workspace, "learnings", {
            title: "Locomotion uses root motion rather than velocity",
            body: "The player character is driven by the animation."
        });
        const atlas = await createMemoryRecord(workspace, "learnings", {
            title: "Texture atlas packing wastes a third of its space",
            body: "Unrelated to either card."
        });
        const rule = await createMemoryRecord(workspace, "conventions", {
            title: "Protocol records are written in English",
            status: "active",
            body: "Applies to everything and mentions neither subject."
        });

        const ids = (context) => new Set(context.records.map((record) => record.id));
        const first = ids(await buildAgentContext(workspace, { cardId: render.id, limit: 20 }));
        const second = ids(
            await buildAgentContext(workspace, { cardId: locomotion.id, limit: 20 })
        );

        assert.ok(first.has(frames.id));
        assert.ok(!first.has(rootMotion.id));
        assert.ok(second.has(rootMotion.id));
        assert.ok(!second.has(frames.id));
        // Relevant to neither, and in neither bundle.
        assert.ok(!first.has(atlas.id) && !second.has(atlas.id));
        // A rule binds work that does not mention it. Both keep it.
        assert.ok(first.has(rule.id) && second.has(rule.id));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a record relevance drops is still reachable by naming it, and the bundle says what it left out", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-relevance-escape-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    try {
        const card = await createCard(workspace, {
            title: "The render loop drops frames above 60 Hz",
            type: "bug",
            area: "api"
        });
        const unrelated = await createMemoryRecord(workspace, "learnings", {
            title: "The audio bus caps at 32 concurrent voices",
            body: "Nothing to do with rendering."
        });
        const alsoUnrelated = await createMemoryRecord(workspace, "learnings", {
            title: "Input mapping is rebindable at runtime",
            body: "Nothing to do with rendering either."
        });

        const before = await buildAgentContext(workspace, {
            cardId: card.id,
            limit: 20
        });
        assert.ok(!before.records.some((record) => record.id === unrelated.id));
        // Silence is the failure mode this replaces: a bundle that drops
        // records reads exactly like a workspace that has none.
        assert.deepEqual(
            [...before.omitted.relevance].sort(),
            [unrelated.id, alsoUnrelated.id].sort()
        );
        assert.match(before.markdown, /\*\*Left out\*\*: 2 below the relevance threshold/);

        // Naming it is the escape hatch, and it does not go through relevance.
        await patchCard(workspace, card.id, { related: [unrelated.id] });
        const after = await buildAgentContext(workspace, {
            cardId: card.id,
            limit: 20
        });
        assert.ok(after.records.some((record) => record.id === unrelated.id));
        // And it stops being counted as left out, having not been.
        assert.deepEqual(after.omitted.relevance, [alsoUnrelated.id]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
