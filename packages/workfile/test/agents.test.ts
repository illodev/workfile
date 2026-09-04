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

test("the protocol keeps the rules an agent cannot infer from the board", async () => {
    // These are not style. Each one is a shape the board CANNOT represent, so a
    // refactor that drops the sentence loses the distinction silently and the
    // loss only shows up as an audit months later.
    //
    // Asserted on the generated text rather than on the source string so that
    // moving the prose between the protocol and a workflow keeps passing, and
    // deleting it does not.
    const root = await mkdtemp(join(tmpdir(), "workfile-protocol-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    try {
        await syncAgentInstructions(workspace, { targets: ["agents-md"] });
        const protocol = await readFile(workspace.paths.agentProtocol, "utf8");
        const workflows = await Promise.all(
            ["finish-work", "discovered-work"].map((name) =>
                readFile(
                    join(workspace.paths.agentWorkflows, `${name}.md`),
                    "utf8"
                )
            )
        );
        const adapter = await readFile(join(root, "AGENTS.md"), "utf8");
        const everywhere = [protocol, ...workflows, adapter].join("\n");

        // The one that cost an audit: `review` and "my turn ended" are the same
        // state to a board and different states to a reader.
        assert.match(
            protocol,
            /two exits, not one/i,
            "the protocol no longer names the two exits"
        );
        assert.match(
            everywhere,
            /review\` is not "my turn ended"|not "my turn ended"/i,
            "nothing says review is not where a turn goes to end"
        );

        // `blocked` has to be reachable as advice, not just defined as a state:
        // a card waiting on somebody else sits in `next` looking startable.
        assert.match(
            protocol,
            /waiting on a hand that is not yours/i,
            "blocked is defined but nothing routes work to it"
        );

        // The heading is load-bearing: `card ac` reads exactly one spelling, and
        // a card that misses it can only be closed with --force, whose Activity
        // line is indistinguishable from a clean close.
        assert.match(
            protocol,
            /## Acceptance criteria/,
            "the protocol never names the heading card ac reads"
        );
        assert.match(
            everywhere,
            /false.{0,40}rewritten with the measurement|premise turned false/i,
            "nothing tells an agent what to do with a criterion whose premise died"
        );

        // The polarity trap: a search exits 0 when it FINDS, so an absence bound
        // to one marks itself backwards, and silently.
        assert.match(
            protocol,
            /exactly backwards/i,
            "the verify polarity trap is undocumented"
        );

        // The counterweight to "create a card for discovered work", without
        // which the board grows a card per batch instead of a number per card.
        assert.match(
            everywhere,
            /Finish it before you card it/i,
            "the counterweight to carding everything is gone"
        );
        assert.match(
            protocol,
            /batch that advances updates its own card/i,
            "nothing stops a batch opening a card per remainder"
        );

        // The four a drain measured agents getting wrong, which were not what
        // the protocol says but what it did not say. Each is pinned by the
        // phrase that carries it, because a rewrite that drops the rule while
        // keeping the section would otherwise pass.

        // Claiming reads as a fence, so the fix in the next file becomes a card
        // instead of a wider claim — the behaviour `Finish it` exists to stop,
        // arriving through the door beside it.
        assert.match(
            protocol,
            /scope is not a fence/i,
            "nothing tells an agent it may widen its own claim"
        );
        // And the one exception, or the rule swallows work that ships apart.
        assert.match(
            protocol,
            /different \*\*release\*\* is a reason to split|closeable against the thing that shipped/i,
            "nothing says a card must stay closeable against what shipped"
        );

        // A question moved into a card loses the context that could have got it
        // answered, and lands on someone who has to rebuild it first.
        assert.match(
            protocol,
            /missing decision is a question, not a card/i,
            "nothing stops a decision becoming a card"
        );

        // Without a source, seven cards that are one job look like seven jobs.
        assert.match(
            protocol,
            /raised: derived.{0,120}source|source.{0,60}naming the card or document/is,
            "a derived card is not asked where it came from"
        );

        // Six of six, and the other side of the contract did not compile.
        assert.match(
            protocol,
            /crosses a contract needs a criterion on each side/i,
            "nothing asks for a criterion on the far side of a contract"
        );

        // Read absolutely, `done` cannot close a card whose product is a
        // measurement, so it closes with --force and leaves no trace.
        assert.match(
            protocol,
            /no runtime to point at/i,
            "done admits no card whose product is a measured conclusion"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("the file's last byte is repaired without touching the prose around it", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-tail-"));
    await cp(fixture, root, { recursive: true });
    await writeFile(join(root, "AGENTS.md"), "# Team notes\n\nKeep this paragraph.\n");
    const workspace = await loadWorkspace({ root });
    try {
        // A pair-style block, where the merge keeps whatever surrounds it —
        // the path where the last byte belongs to the author, not to us.
        await syncAgentInstructions(workspace, { targets: ["agents-md"] });
        const healthy = await readFile(join(root, "AGENTS.md"), "utf8");
        assert.equal(healthy.endsWith("\n"), true);

        await writeFile(join(root, "AGENTS.md"), healthy.replace(/\n+$/, ""));
        const stale = await checkAgentInstructions(workspace, {
            targets: ["agents-md"]
        });
        assert.equal(stale.ok, false, "the missing byte reported current");
        const issue = stale.issues.find((entry) => entry.file === "AGENTS.md");
        assert.ok(issue, "AGENTS.md was not among the issues");
        assert.equal(issue.details.reason, "trailing-newline");

        await syncAgentInstructions(workspace, { targets: ["agents-md"] });
        const repaired = await readFile(join(root, "AGENTS.md"), "utf8");
        assert.equal(repaired, healthy);
        assert.match(repaired, /Keep this paragraph\./);
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

/**
 * The bill for the exemption the sibling test above argues for.
 *
 * Normative records skip the relevance filter because a rule binds work that
 * does not mention it — and then the cap took them out again, so the guarantee
 * held only while a workspace was small enough not to need it. Fifty accepted
 * decisions against a `--limit` of twenty left thirty of them as a number in a
 * footer, which is the state the exemption exists to prevent ([[T-0176]]).
 *
 * Fifty is the number the card named and roughly a real project's ADR set. The
 * budget assertion is what makes this a test rather than a demonstration: the
 * digest has to be cheap, or it is the flood again in smaller type.
 */
test("fifty accepted decisions fit in a bundle, and none of them vanish", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-normative-flood-"));
    await cp(fixture, root, { recursive: true });
    const workspace = await loadWorkspace({ root });
    try {
        // Typed rather than inferred: an empty literal is `never[]`, so the
        // `.id` read below has no property to find.
        const decisions: { id: string }[] = [];
        for (let index = 0; index < 50; index += 1) {
            decisions.push(
                await createMemoryRecord(workspace, "decisions", {
                    title: `Accepted decision number ${index}`,
                    status: "accepted",
                    // Long enough that fifty of them in full is the failure
                    // this is about, rather than something the cap absorbs.
                    body: `We decided this, at length. ${"Rationale. ".repeat(40)}`
                })
            );
        }
        const card = await createCard(workspace, {
            title: "Rework the API pagination",
            type: "task",
            area: "api",
            body: "Body.\n\n## Acceptance criteria\n\n- [ ] Verifiable check\n"
        });

        const context = await buildAgentContext(workspace, {
            cardId: card.id,
            limit: 20
        });
        assert.ok(
            context.records.length <= 20,
            "the cap still holds — the digest is not a way around it"
        );

        // Criterion: no normative record disappears without the bundle saying
        // so. Nothing weaker will do here, because "said so" is what an agent
        // has to be able to act on: every ID is either summarised in full or
        // named in the digest, and the assertion is over all fifty.
        const inFull = new Set(context.records.map((record) => record.id));
        const named = new Set(context.digest.map((entry) => entry.id));
        const missing = decisions
            .map((record) => record.id)
            .filter((id) => !inFull.has(id) && !named.has(id));
        assert.deepEqual(missing, [], "an accepted decision left the bundle silently");
        assert.ok(named.size, "with fifty decisions and a cap of twenty, some must be digested");
        for (const id of named) {
            assert.ok(
                context.markdown.includes(id),
                `${id} is in the digest but not in the markdown an agent reads`
            );
        }

        // Criterion: a bundle a prompt can carry. Calibrated against this
        // workspace rather than a constant, because a constant generous
        // enough to be safe is generous enough to pass on full summaries —
        // 31 of them measured 19k against a 60k ceiling, so the ceiling was
        // asserting nothing. What has to hold is the marginal cost: keeping a
        // normative record has to cost a line, not an entry.
        const [summarized, listed] = context.markdown.split("**Also in force**");
        assert.ok(listed, "the digest has to be in the markdown to be measured");
        const perSummary = summarized.length / context.records.length;
        assert.ok(
            listed.length < (named.size * perSummary) / 4,
            `the digest costs ${Math.round(listed.length)} against ` +
                `${Math.round(named.size * perSummary)} for the same records in full`
        );
        // And the line has to be a line, in the markdown and not only in the
        // arithmetic above.
        const digested = context.markdown
            .split("\n")
            .filter((line) => /^- \*\*[A-Z]+-\d+\*\* — /.test(line));
        assert.equal(digested.length, named.size);
        assert.ok(
            digested.every((line) => line.length < 120),
            "a digest entry is a title, not a summary"
        );
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
