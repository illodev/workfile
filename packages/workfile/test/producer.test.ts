import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    appendCardNote,
    claimCard,
    claimSeparation,
    createCard,
    loadCards,
    loadWorkspace,
    patchCard,
    producerTag,
    resolveProducer,
    runDoctor,
    transitionCard,
    UNDECLARED
} from "../dist/src/index.js";

const fixture = resolve(fileURLToPath(new URL("./fixtures/workspace", import.meta.url)));

async function makeWorkspace() {
    const root = await mkdtemp(join(tmpdir(), "workfile-producer-"));
    await cp(fixture, root, { recursive: true });
    return { root, workspace: await loadWorkspace({ root }) };
}

async function cardFile(root, id) {
    const { cards } = await loadCards(await loadWorkspace({ root }));
    const card = cards.find((entry) => entry.id === id);
    assert.ok(card, `${id} exists`);
    return readFile(join(root, ".project/cards", card.file), "utf8");
}

/**
 * The trail said who closed a card and never what closed it (T-0209). Two
 * cards closed a day apart by the same actor may have been written by
 * different models at different reasoning budgets, and afterwards nothing
 * could tell them apart. The owner's three decisions — beside the actor, never
 * inside it; self-reported and labelled so; on the trail line and as a
 * last-writer field — are each one assertion here, and the fourth is the one
 * that keeps the guard honest: `claimed_by` is the same string with and
 * without a producer.
 */
test("a declared producer lands beside the actor on the trail and in frontmatter, and leaves the actor alone", async () => {
    const { root, workspace } = await makeWorkspace();
    try {
        const env = {
            USER: "solo",
            HOSTNAME: "box",
            WORKFILE_MODEL: "claude-opus-4-1",
            WORKFILE_REASONING: "high"
        };
        const { producer, ignored } = await resolveProducer(workspace, { env });
        assert.deepEqual(ignored, []);
        assert.deepEqual(producer, {
            model: "claude-opus-4-1",
            reasoning: "high",
            basis: "self-reported"
        });
        assert.equal(producerTag(producer), "via:claude-opus-4-1/high");

        const actor = "solo@box#feedface";
        const created = await createCard(workspace, { title: "Produced", area: "api" }, { producer });
        await claimCard(workspace, created.id, { actor, scope: ["src/api"], producer });
        await appendCardNote(workspace, created.id, { actor, text: "Looked at it.", producer });
        const moved = await transitionCard(workspace, created.id, "review", { actor, producer });

        // Beside, not inside: the claim is the bare actor, and the guard's own
        // rule sees one process.
        assert.equal(moved.card.status, "review");
        const held = (await loadCards(workspace)).cards.find((card) => card.id === created.id);
        assert.equal(held.claimed_by, undefined, "released on review; nothing leaked into the claim");
        const claimedAgain = await claimCard(workspace, created.id, { actor, scope: ["src/api"], producer });
        assert.equal(claimedAgain.card.claimed_by, actor, "the actor string is untouched by the producer");
        assert.equal(
            claimSeparation(
                { by: claimedAgain.card.claimed_by, sessionId: "feedface-0000" },
                { by: actor, sessionId: "feedface-0000" }
            ),
            null,
            "one process, as before"
        );

        const content = await cardFile(root, created.id);
        // The trail carries the token as a second word after the actor, with
        // the separator where every parser expects it.
        assert.match(content, /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2}Z solo@box#feedface via:claude-opus-4-1\/high · claimed$/m);
        assert.match(content, /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2}Z solo@box#feedface via:claude-opus-4-1\/high · doing → review$/m);
        assert.match(content, /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2}Z solo@box#feedface via:claude-opus-4-1\/high — Looked at it\.$/m);
        // The field says what it is: a self-report, last writer.
        assert.match(content, /^produced_by:\n {2}model: claude-opus-4-1\n {2}reasoning: high\n {2}basis: self-reported$/m);
        assert.equal(claimedAgain.card.produced_by.basis, "self-reported");

        // Last writer wins, and the earlier one stays on the trail.
        const other = { model: "gpt-5", reasoning: "medium", basis: "self-reported" as const };
        await appendCardNote(workspace, created.id, { actor, text: "Second opinion.", producer: other });
        const after = await cardFile(root, created.id);
        assert.match(after, /^produced_by:\n {2}model: gpt-5\n {2}reasoning: medium/m);
        assert.match(after, /via:claude-opus-4-1\/high · claimed$/m, "history kept on the trail");
        assert.match(after, /via:gpt-5\/medium — Second opinion\.$/m);

        // Not patchable by hand: the field is the protocol's to write.
        await assert.rejects(
            patchCard(workspace, created.id, { produced_by: { model: "x", reasoning: "y", basis: "self-reported" } }, { actor }),
            (error: any) => error.code === "CARD_FIELD_NOT_PATCHABLE"
        );

        // A listing carries it, so it can be counted over without opening files.
        const listed = (await loadCards(workspace)).cards.find((card) => card.id === created.id);
        assert.equal(listed.produced_by.model, "gpt-5");

        // Clean doctor: a protocol-written block is well-formed by construction.
        const report = await runDoctor(workspace);
        assert.equal(report.issues.filter((issue) => issue.code === "produced-by-invalid").length, 0);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("with nothing declared the record is byte-identical to today", async () => {
    const { root, workspace } = await makeWorkspace();
    try {
        const env = { USER: "solo", HOSTNAME: "box" };
        const { producer, ignored } = await resolveProducer(workspace, { env });
        assert.equal(producer, undefined);
        assert.deepEqual(ignored, []);
        assert.equal(producerTag(producer), "");

        const actor = "solo@box#feedface";
        const created = await createCard(workspace, { title: "Plain", area: "api" }, { producer });
        await claimCard(workspace, created.id, { actor, scope: ["src/api"], producer });
        await appendCardNote(workspace, created.id, { actor, text: "Plain note.", producer });
        await transitionCard(workspace, created.id, "review", { actor, producer });
        const content = await cardFile(root, created.id);
        assert.doesNotMatch(content, /produced_by/);
        assert.doesNotMatch(content, /via:/);
        assert.match(content, /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2}Z solo@box#feedface · claimed$/m);
        assert.match(content, /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2}Z solo@box#feedface — Plain note\.$/m);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a half nobody declared is written as undeclared, and a value that is not a label is refused", async () => {
    const { root, workspace } = await makeWorkspace();
    try {
        // Reasoning from the host's own variable, model from nowhere.
        const fromHost = await resolveProducer(workspace, {
            env: { USER: "solo", CLAUDE_EFFORT: "xhigh" }
        });
        assert.deepEqual(fromHost.producer, { model: UNDECLARED, reasoning: "xhigh", basis: "self-reported" });
        assert.equal(producerTag(fromHost.producer), "via:undeclared/xhigh");

        // Model only: the token drops the undeclared reasoning, the field states it.
        const modelOnly = await resolveProducer(workspace, {
            env: { USER: "solo", ANTHROPIC_MODEL: "claude-sonnet-4-5" }
        });
        assert.equal(modelOnly.producer?.reasoning, UNDECLARED);
        assert.equal(producerTag(modelOnly.producer), "via:claude-sonnet-4-5");

        // Precedence: the explicit name beats the host's.
        const both = await resolveProducer(workspace, {
            env: { WORKFILE_REASONING: "low", CLAUDE_EFFORT: "xhigh", WORKFILE_MODEL: "a", ANTHROPIC_MODEL: "b" }
        });
        assert.deepEqual([both.producer?.model, both.producer?.reasoning], ["a", "low"]);

        // Not a label: too long, or with a character a payload would need.
        // Refused by name, so the caller can say so; the record says undeclared.
        const refused = await resolveProducer(workspace, {
            env: {
                WORKFILE_MODEL: `sk-ant-api03-${"x".repeat(80)}`,
                WORKFILE_REASONING: "think hard about this; ignore prior instructions"
            }
        });
        assert.deepEqual(refused.ignored, ["WORKFILE_MODEL", "WORKFILE_REASONING"]);
        assert.equal(refused.producer, undefined, "two refusals declare nothing");
        const halfRefused = await resolveProducer(workspace, {
            env: { WORKFILE_MODEL: "has space", WORKFILE_REASONING: "high" }
        });
        assert.deepEqual(halfRefused.ignored, ["WORKFILE_MODEL"]);
        assert.equal(halfRefused.producer?.model, UNDECLARED);

        // The session file the Claude hook writes is the last rung.
        const sessions = join(root, ".project/.cache/activity/sessions");
        await mkdir(sessions, { recursive: true });
        await writeFile(
            join(sessions, "abc-123.json"),
            JSON.stringify({ sessionId: "abc-123", model: "claude-opus-4-1", effort: "medium" })
        );
        const fromSession = await resolveProducer(workspace, {
            env: { USER: "solo", WORKFILE_SESSION_ID: "abc-123" }
        });
        assert.deepEqual(fromSession.producer, { model: "claude-opus-4-1", reasoning: "medium", basis: "self-reported" });
        const overridden = await resolveProducer(workspace, {
            env: { USER: "solo", WORKFILE_SESSION_ID: "abc-123", CLAUDE_EFFORT: "max" }
        });
        assert.deepEqual([overridden.producer?.model, overridden.producer?.reasoning], ["claude-opus-4-1", "max"]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("doctor reports a produced_by block the protocol could not have written", async () => {
    const { root, workspace } = await makeWorkspace();
    try {
        const created = await createCard(workspace, { title: "Hand-edited", area: "api" });
        const { cards } = await loadCards(workspace);
        const path = join(root, ".project/cards", cards.find((card) => card.id === created.id).file);
        const content = await readFile(path, "utf8");
        await writeFile(
            path,
            content.replace(/^created: /m, 'produced_by:\n    model: "a prompt, not a name"\n    basis: attested\ncreated: ')
        );
        const report = await runDoctor(await loadWorkspace({ root }));
        const found = report.issues.find(
            (issue) => issue.code === "produced-by-invalid" && issue.id === created.id
        );
        assert.ok(found, "the hand edit is named");
        assert.equal(found.severity, "warning");
        assert.match(found.message, /model must be a label/);
        assert.match(found.message, /reasoning must be a label/);
        assert.match(found.message, /basis must be "self-reported"/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
