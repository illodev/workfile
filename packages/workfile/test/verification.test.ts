import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { createTestWorkspace, withServer } from "./support/workspace.ts";

import {
    appendCardNote,
    archiveCard,
    bulkPatchCards,
    claimCard,
    createCard,
    createMcpProtocolServer,
    criteriaDigest,
    criterionDigest,
    diagnoseCards,
    loadCards,
    loadWorkspace,
    MCP_LEGACY_PROTOCOL_VERSION,
    misplacedTrailEntries,
    patchCard,
    patchCardBody,
    releaseCard,
    reopenCard,
    runDoctor,
    setCardAcceptance,
    splitSections,
    transitionCard
} from "../dist/src/index.js";

const execute = promisify(execFile);

const BODY = [
    "Prose the author wrote.",
    "",
    "## Acceptance criteria",
    "",
    "- [ ] The gate refuses done while a criterion is unproven.",
    "- [ ] A forced move names the gate it walked past.",
    ""
].join("\n");

const AT = "2026-08-05T10:12:00.000Z";

/** A card with criteria, both proven, one call away from `done`. */
async function provenCard(workspace, title = "A card to close") {
    const { id } = await createCard(workspace, { title, area: "api" });
    await patchCardBody(workspace, id, { body: BODY });
    await setCardAcceptance(workspace, id, { check: [1, 2] });
    return id;
}

async function reload(workspace, id) {
    const { cards } = await loadCards(workspace);
    return cards.find((card) => card.id === id);
}

/** `Response.json()` is typed `unknown`, and every caller here wants a record. */
async function jsonBody(response): Promise<any> {
    return response.json();
}

function errorOf(promise) {
    return promise.then(
        () => null,
        (error) => error
    );
}

/**
 * ADR-0016 draws a nested mapping, and until T-0200 the codec could not hold
 * one — so every plan for this card proposed five flat `verified_*` scalars
 * instead. It can now, and the shape on disk is the shape the decision records.
 * Asserted against the file rather than against the parsed card, because "it
 * round-trips" and "it is written the way the decision draws it" are different
 * claims and only the second one is the criterion.
 */
test("a close writes the verified block ADR-0016 draws, and it round-trips", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-verified-shape-"
    });
    try {
        const id = await provenCard(workspace);
        const closed = await transitionCard(workspace, id, "done", {
            actor: "tester",
            now: AT
        });

        const raw = await readFile(closed.path, "utf8");
        assert.match(
            raw,
            /\nverified:\n {2}at: "2026-08-05T10:12:00\.000Z"\n {2}method: local\n {2}digest: "sha256:[0-9a-f]{64}"\n---\n/,
            "the block is a mapping one level deep, in the order the ADR draws"
        );

        assert.equal(closed.card.verified.method, "local");
        assert.equal(closed.card.verified.at, AT);
        assert.match(closed.card.verified.digest, /^sha256:[0-9a-f]{64}$/);
        // Outside a repository there is no commit to record, and that is a
        // supported state rather than a failure — every other test in this file
        // exercises it by running in a `mkdtemp` fixture.
        assert.equal(closed.card.verified.commit, undefined);
        assert.equal(closed.card.verified.run, undefined);

        // A later frontmatter write must not disturb a key it does not name.
        // The codec re-reads `verified` as a mapping and splices only what the
        // patch touched; if that ever stopped being true the block would come
        // back as `[object Object]` or as an unwritable opaque region.
        const patched = await patchCard(workspace, id, { priority: "high" });
        assert.deepEqual(patched.card.verified, closed.card.verified);
        assert.match(await readFile(closed.path, "utf8"), /\n {2}method: local\n/);
    } finally {
        await cleanup();
    }
});

/**
 * The ordering proof, executed.
 *
 * The digest is taken after every body write the closing transition performs
 * and before the only write that follows it, and the claim that this is
 * sufficient rests on `patchFrontmatter` copying the body byte for byte. That
 * is a claim about two functions in two modules, so it is pinned here rather
 * than argued in a comment: recompute the digest from the card as it was
 * stored, immediately, and again after two further writes that reflow the body.
 */
test("the digest survives the write that creates it, and the writes after it", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-verified-digest-"
    });
    try {
        const id = await provenCard(workspace);
        const closed = await transitionCard(workspace, id, "done", {
            actor: "tester",
            now: AT
        });
        const recorded = closed.card.verified.digest;
        assert.equal(
            criteriaDigest({
                body: closed.card.verified ? closed.card.body : "",
                verify: closed.card.verify
            }),
            recorded,
            "the digest does not match the card the same call returned"
        );

        // `card note` appends under a different heading, which `splitSections`
        // rebuilds the whole body to do.
        await appendCardNote(workspace, id, { text: "Later.", actor: "tester" });
        const noted = await reload(workspace, id);
        assert.equal(criteriaDigest({ body: noted.body, verify: noted.verify }), recorded);

        // And a second trail entry, from a transition that is not a close.
        await transitionCard(workspace, id, "review", { actor: "tester" });
        await transitionCard(workspace, id, "done", { actor: "tester" });
        const reclosed = await reload(workspace, id);
        assert.equal(
            criteriaDigest({ body: reclosed.body, verify: reclosed.verify }),
            recorded,
            "the reading the digest is taken over is blind to trail appends"
        );
    } finally {
        await cleanup();
    }
});

/**
 * A reorder is harmless and an edit is not, which is the same rule T-0185's
 * bindings follow — and it has to be, or the two mechanisms would disagree
 * about what "the criteria changed" means on the same card.
 */
test("the digest moves on an edit and not on a reorder or a checkbox", async () => {
    const digest = (body) => criteriaDigest({ body });
    const reordered = [
        "## Acceptance criteria",
        "",
        "- [ ] A forced move names the gate it walked past.",
        "- [ ] The gate refuses done while a criterion is unproven.",
        ""
    ].join("\n");
    assert.equal(digest(reordered), digest(BODY));
    assert.equal(digest(BODY.replaceAll("- [ ]", "- [x]")), digest(BODY));
    assert.equal(
        digest(BODY.replace("  ", " ").replace("Prose the author wrote.", "Rewritten prose.")),
        digest(BODY),
        "prose outside the region is not the region"
    );
    assert.notEqual(digest(BODY.replace("names the gate", "names every gate")), digest(BODY));

    // The `verify` block is inside the digest and the entry order is not.
    const entry = (id) => ({
        id,
        run: ["pnpm", "test"],
        criteria: [criterionDigest("A forced move names the gate it walked past.")]
    });
    const one = criteriaDigest({ body: BODY, verify: [entry("a"), entry("b")] });
    assert.equal(criteriaDigest({ body: BODY, verify: [entry("b"), entry("a")] }), one);
    assert.notEqual(criteriaDigest({ body: BODY, verify: [entry("a")] }), one);
    assert.notEqual(criteriaDigest({ body: BODY }), one);
});

/**
 * One gate, and every door reaches it.
 *
 * The rule lives in `mutateCard`, so this is really asking whether any surface
 * can reach `done` without passing through it — which is the question T-0183
 * had to ask about `assertAcceptanceMet` and got the wrong answer to three
 * times.
 */
test("every door into done writes the block", async () => {
    await withServer(async ({ workspace, url }) => {
        const local = async (title) => provenCard(workspace, title);

        const viaTransition = await transitionCard(
            workspace,
            await local("Door: transition"),
            "done",
            { actor: "tester", now: AT }
        );
        assert.equal(viaTransition.card.verified.method, "local");

        const viaPatch = await patchCard(
            workspace,
            await local("Door: patch"),
            { status: "done" },
            { actor: "tester", now: AT, method: "ci", run: "https://ci.example/1" }
        );
        assert.equal(viaPatch.card.verified.method, "ci");
        assert.equal(viaPatch.card.verified.run, "https://ci.example/1");

        const viaRelease = await releaseCard(workspace, await local("Door: release"), {
            status: "done",
            actor: "tester",
            now: AT
        });
        assert.equal(viaRelease.card.verified.method, "local");
        assert.equal(viaRelease.card.verified.at, AT, "the release door takes a clock too");

        const bulkIds = [await local("Door: bulk one"), await local("Door: bulk two")];
        const bulk = await bulkPatchCards(workspace, bulkIds, { status: "done" });
        assert.equal(bulk.updated, 2);
        for (const record of bulk.records) {
            assert.equal(record.verified.method, "local");
        }

        const httpTransition = await fetch(
            `${url}/api/v2/cards/${await local("Door: HTTP transition")}/transition`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "done",
                    actor: "tester",
                    method: "ci",
                    run: "https://ci.example/2"
                })
            }
        );
        assert.equal(httpTransition.status, 200);
        assert.equal((await jsonBody(httpTransition)).record.verified.method, "ci");

        const httpPatch = await fetch(
            `${url}/api/v2/cards/${await local("Door: HTTP patch")}`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                // The flat shape, which is the one that sent `force` to the
                // field sanitizer before T-0184 widened the envelope.
                body: JSON.stringify({ status: "done", method: "ci", run: "https://ci.example/3" })
            }
        );
        assert.equal(httpPatch.status, 200);
        assert.equal((await jsonBody(httpPatch)).record.verified.method, "ci");

        const legacy = await fetch(`${url}/api/tasks/${await local("Door: legacy patch")}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "done", method: "manual", evidence: "I watched it", actor: "tester" })
        });
        assert.equal(legacy.status, 200);
        assert.equal((await jsonBody(legacy)).task.verified.method, "manual");

        // MCP: the three tools that can reach `done`.
        const server = createMcpProtocolServer(workspace, { version: "0.6.0" });
        await server.handle({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: MCP_LEGACY_PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: { name: "test-client", version: "1.0.0" }
            }
        });
        await server.handle({ jsonrpc: "2.0", method: "notifications/initialized" });
        const call = async (name, args) => {
            const response: any = await server.handle({
                jsonrpc: "2.0",
                id: 2,
                method: "tools/call",
                params: { name, arguments: args }
            });
            assert.equal(response.result?.isError, undefined, JSON.stringify(response));
            return response.result.structuredContent.record;
        };
        assert.equal(
            (
                await call("project_card_transition", {
                    id: await local("Door: MCP transition"),
                    status: "done",
                    method: "ci",
                    run: "https://ci.example/4"
                })
            ).verified.method,
            "ci"
        );
        assert.equal(
            (
                await call("project_card_patch", {
                    id: await local("Door: MCP patch"),
                    changes: { status: "done" }
                })
            ).verified.method,
            "local"
        );
        assert.equal(
            (
                await call("project_card_release", {
                    id: await local("Door: MCP release"),
                    status: "done"
                })
            ).verified.method,
            "local"
        );
    }, { prefix: "workfile-verified-doors-" });
});

/**
 * `forced` is derived, and it agrees with T-0184 rather than repeating it.
 *
 * Two mechanisms describing one event have to be pinned as agreeing, or the
 * next change to either quietly makes the record self-contradictory. The trail
 * line is asserted byte for byte, and the field carries no reason of its own.
 */
test("a forced close records forced, and the trail line is unchanged", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-verified-forced-"
    });
    try {
        const { id } = await createCard(workspace, { title: "Unproven", area: "api" });
        await patchCardBody(workspace, id, { body: BODY });
        const forced = await transitionCard(workspace, id, "done", {
            actor: "tester",
            force: true,
            reason: "The device the criteria need is not on this machine",
            now: "2026-08-01T11:00:00.000Z"
        });
        assert.equal(forced.card.verified.method, "forced");
        assert.deepEqual(Object.keys(forced.card.verified), ["at", "method", "digest"]);
        assert.equal(
            forced.card.body.split("\n").filter((line) => / · /.test(line)).at(-1),
            "- 2026-08-01 11:00Z tester · backlog → done (forced past 2 unproven " +
                "criteria: The device the criteria need is not on this machine)"
        );

        // Taking somebody's claim over is not what makes a close forced: the
        // criteria were still proven by whatever proved them.
        const clean = await provenCard(workspace, "Proven but claimed");
        await claimCard(workspace, clean, { actor: "someone-else" });
        const takeover = await transitionCard(workspace, clean, "done", {
            actor: "tester",
            force: true,
            reason: "They went offline",
            now: AT
        });
        assert.equal(takeover.card.verified.method, "local");
    } finally {
        await cleanup();
    }
});

/** Each refusal, and each of them before anything is written. */
test("a verification that would say nothing is refused", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-verified-refusals-"
    });
    try {
        const close = (id, options) =>
            transitionCard(workspace, id, "done", { actor: "tester", now: AT, ...options });

        const noEvidence = await errorOf(
            close(await provenCard(workspace, "Manual, no evidence"), { method: "manual" })
        );
        assert.equal(noEvidence.code, "CARD_VERIFICATION_EVIDENCE_REQUIRED");

        const noActor = await errorOf(
            transitionCard(workspace, await provenCard(workspace, "Manual, no actor"), "done", {
                method: "manual",
                evidence: "I watched the recut demo"
            })
        );
        assert.equal(
            noActor.code,
            "CARD_VERIFICATION_ACTOR_REQUIRED",
            "an unattributed manual verification is the one method worth nothing"
        );

        const noRun = await errorOf(
            close(await provenCard(workspace, "CI, no run"), { method: "ci" })
        );
        assert.equal(noRun.code, "CARD_VERIFICATION_RUN_REQUIRED");

        const unknown = await errorOf(
            close(await provenCard(workspace, "Unknown method"), { method: "vibes" })
        );
        assert.equal(unknown.code, "CARD_VERIFICATION_METHOD_INVALID");
        assert.deepEqual(unknown.details.allowed, ["local", "ci", "manual"]);

        const asked = await errorOf(
            close(await provenCard(workspace, "Asked to be forced"), { method: "forced" })
        );
        assert.equal(asked.code, "CARD_VERIFICATION_METHOD_CONFLICT");

        // A gate was waived, so the method is not the caller's to choose.
        const { id: unprovenId } = await createCard(workspace, {
            title: "Waived and claimed proved",
            area: "api"
        });
        await patchCardBody(workspace, unprovenId, { body: BODY });
        const conflict = await errorOf(
            close(unprovenId, { force: true, reason: "No device", method: "ci", run: "https://ci.example/9" })
        );
        assert.equal(conflict.code, "CARD_VERIFICATION_METHOD_CONFLICT");
        assert.equal((await reload(workspace, unprovenId)).status, "backlog");

        // Silent flag-dropping is the failure an agent cannot detect, and this
        // card would otherwise have shipped it on three paths while refusing it
        // on a fourth.
        const open = await provenCard(workspace, "Not a close");
        for (const [options, where] of [
            [{ method: "ci", run: "https://ci.example/8" }, "a move to review"],
            [{ evidence: "prose" }, "a move to review"]
        ] as const) {
            const dropped = await errorOf(
                transitionCard(workspace, open, "review", { actor: "tester", ...options })
            );
            assert.equal(dropped.code, "CARD_VERIFICATION_NOT_APPLICABLE", where);
        }
        const claiming = await errorOf(
            transitionCard(workspace, open, "doing", { actor: "tester", method: "ci", run: "https://ci.example/7" })
        );
        assert.equal(claiming.code, "CARD_VERIFICATION_NOT_APPLICABLE");

        // Including a re-close, which would otherwise replace a `ci`
        // verification with whatever the second caller happened to pass.
        const done = await provenCard(workspace, "Closed twice");
        const first = await transitionCard(workspace, done, "done", {
            actor: "tester",
            now: AT,
            method: "ci",
            run: "https://ci.example/6"
        });
        const again = await errorOf(close(done, { method: "local" }));
        assert.equal(again.code, "CARD_VERIFICATION_NOT_APPLICABLE");
        await transitionCard(workspace, done, "done", { actor: "tester" });
        assert.deepEqual((await reload(workspace, done)).verified, first.card.verified);
    } finally {
        await cleanup();
    }
});

/**
 * Manual evidence is prose, so it lives in the body — and it has to land
 * somewhere `doctor --fix` will leave it. `TRAIL_ENTRY` needs ` · ` after a run
 * of characters holding neither separator, and the ` — ` this line uses is one
 * of them, so the shape is safe even when the evidence itself quotes a trail.
 */
test("manual evidence is one line under Notes, and not a trail entry", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-verified-evidence-"
    });
    try {
        const id = await provenCard(workspace, "Judged by a person");
        const closed = await transitionCard(workspace, id, "done", {
            actor: "alvaro",
            now: AT,
            method: "manual",
            evidence: "The recut demo video reads correctly\n  end to end · twice"
        });
        assert.equal(closed.card.verified.method, "manual");

        const notes = splitSections(closed.card.body).find(
            (section) => section.heading === "## Notes"
        );
        assert.equal(
            notes?.text,
            "## Notes\n\n- 2026-08-05 10:12Z alvaro — manual verification: " +
                "The recut demo video reads correctly end to end · twice",
            "a multi-line reason collapses to one line, like a forced move's does"
        );
        assert.deepEqual(misplacedTrailEntries(closed.card.body), []);
    } finally {
        await cleanup();
    }
});

/**
 * The block is state, not history: a card that is no longer done is no longer
 * verified, and the trail already records that it was closed once.
 */
test("leaving done clears the block, and archiving keeps it", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-verified-clear-"
    });
    try {
        const id = await provenCard(workspace, "Closed then reopened");
        await transitionCard(workspace, id, "done", { actor: "tester", now: AT });

        const archived = await archiveCard(workspace, id, { actor: "tester" });
        assert.equal(archived.card.verified.method, "local");

        const reopened = await reopenCard(workspace, id, { status: "backlog", actor: "tester" });
        assert.equal(reopened.card.verified, undefined);
        assert.doesNotMatch(await readFile(reopened.path, "utf8"), /verified:/);

        // And claiming a done card, which is a move out of done by another name.
        const claimed = await provenCard(workspace, "Closed then claimed");
        await transitionCard(workspace, claimed, "done", { actor: "tester", now: AT });
        const held = await claimCard(workspace, claimed, { actor: "tester" });
        assert.equal(held.card.verified, undefined);
    } finally {
        await cleanup();
    }
});

/** The two rules that need no repository, on a workspace that is not one. */
test("doctor reports a card verified against text that has since changed", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-verified-doctor-"
    });
    try {
        const id = await provenCard(workspace, "Edited after the fact");
        await transitionCard(workspace, id, "done", { actor: "tester", now: AT });

        const findings = async () => {
            const { cards } = await loadCards(workspace);
            const report = await diagnoseCards({
                cards,
                workspace,
                checkPaths: false,
                checkGit: false
            });
            return report;
        };

        assert.deepEqual(
            (await findings()).issues.filter((issue) =>
                issue.code.startsWith("verified-")
            ),
            []
        );

        // Reordering the criteria is not an edit, and neither is unchecking a
        // box — `done-unchecked` already names that one.
        await patchCardBody(workspace, id, {
            body: BODY.replaceAll("- [ ]", "- [x]")
                .split("\n")
                .map((line) => line)
                .join("\n")
        });
        assert.equal(
            (await findings()).issues.filter((issue) => issue.code === "verified-criteria-changed")
                .length,
            0
        );

        await patchCardBody(workspace, id, {
            body: BODY.replaceAll("- [ ]", "- [x]").replace("names the gate", "names every gate")
        });
        const report = await findings();
        const changed: any = report.issues.find(
            (issue) => issue.code === "verified-criteria-changed"
        );
        assert.ok(changed, "an edited criterion is not reported");
        assert.equal(changed.severity, "warning");
        assert.equal(changed.details.method, "local");
        assert.equal(report.ok, true, "reported, never enforced retroactively");
    } finally {
        await cleanup();
    }
});

/**
 * Nothing can write a malformed block, so one means a hand edit or a card that
 * arrived as a file in somebody's diff. Reported because the damage is not
 * cosmetic: a `verified` the codec reads as opaque cannot be rewritten *or*
 * cleared, which makes the card unreopenable.
 */
test("doctor reports a verified block that does not read as a verification", async () => {
    const { root, workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-verified-invalid-"
    });
    try {
        const id = await provenCard(workspace, "Hand edited");
        const closed = await transitionCard(workspace, id, "done", {
            actor: "tester",
            now: AT
        });
        const file = join(root, ".project/cards", closed.file);
        await writeFile(
            file,
            (await readFile(file, "utf8")).replace("method: local", "method: totally-fine")
        );

        const { cards } = await loadCards(workspace);
        const report = await diagnoseCards({
            cards,
            workspace,
            checkPaths: false,
            checkGit: false
        });
        const invalid = report.issues.find(
            (issue) => issue.code === "verified-block-invalid"
        );
        assert.ok(invalid);
        assert.equal(invalid.severity, "warning");
        assert.equal(report.ok, true);
        assert.match(invalid.message, /method is totally-fine/);
        // The digest rule stays quiet: there is no verification to compare a
        // digest against, and two findings for one broken block is noise.
        assert.equal(
            report.issues.filter((issue) => issue.code === "verified-criteria-changed").length,
            0
        );
    } finally {
        await cleanup();
    }
});

/** A fabricated workspace with no `root` must never reach for a subprocess. */
test("the git probe stays out of the way when nothing asks for it", async () => {
    const report = await diagnoseCards({
        cards: [
            {
                id: "T-0001",
                file: "T-0001-a.md",
                title: "A",
                status: "done",
                type: "task",
                priority: "medium",
                area: "general",
                created: "2026-08-05",
                updated: "2026-08-05",
                body: ""
            }
        ],
        workspace: {
            config: {
                cards: {
                    areas: ["general"],
                    maxHierarchyDepth: 2,
                    claimLeaseHours: 24,
                    idPrefix: "T",
                    axes: {},
                    verification: { commands: [] }
                }
            },
            paths: { cache: join(tmpdir(), "workfile-nonexistent-cache") }
        },
        checkPaths: false
    });
    assert.equal(report.ok, true);
    assert.deepEqual(
        report.issues.filter((issue) => issue.code.startsWith("verified-")),
        []
    );
});

/**
 * The one test that needs a repository. A commit is recorded, and a commit that
 * stops being an ancestor of HEAD is reported without failing the run — the
 * branch that proved a card can be rebased away, and that is information rather
 * than a broken record.
 */
test("in a repository, a close records HEAD and doctor reports an orphaned one", async () => {
    const available = await execute("git", ["--version"]).then(
        () => true,
        () => false
    );
    if (!available) {
        // Git absent is a supported state for the feature, so a machine without
        // it is not a failing machine. Every other test here runs the no-git
        // path already.
        return;
    }
    const { root, cleanup } = await createTestWorkspace({ prefix: "workfile-verified-git-" });
    try {
        const run = (args) =>
            execute("git", args, {
                cwd: root,
                env: {
                    ...process.env,
                    GIT_AUTHOR_NAME: "Test",
                    GIT_AUTHOR_EMAIL: "test@example.invalid",
                    GIT_COMMITTER_NAME: "Test",
                    GIT_COMMITTER_EMAIL: "test@example.invalid"
                }
            });
        await run(["init", "-q"]);
        await run(["add", "-A"]);
        await run(["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "first"]);

        const workspace = await loadWorkspace({ root });
        const id = await provenCard(workspace, "Closed in a repository");
        const closed = await transitionCard(workspace, id, "done", {
            actor: "tester",
            now: AT
        });
        const head = (await run(["rev-parse", "HEAD"])).stdout.trim();
        assert.equal(closed.card.verified.commit, head);

        const reachable = await runDoctor(workspace, { checkPaths: false });
        assert.deepEqual(
            reachable.issues.filter((issue) => issue.code === "verified-commit-unreachable"),
            [],
            "a commit that is an ancestor of HEAD reports nothing"
        );

        // Amend rather than branch, so no assumption is made about
        // `init.defaultBranch`. The recorded sha still exists; it is simply no
        // longer reachable.
        await run([
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "-q",
            "--amend",
            "-m",
            "first, again"
        ]);
        const orphaned = await runDoctor(workspace, { checkPaths: false });
        const finding = orphaned.issues.find(
            (issue) => issue.code === "verified-commit-unreachable"
        );
        assert.ok(finding, "an orphaned commit is not reported");
        assert.equal(finding.severity, "warning");
        assert.equal(finding.id, id);
        assert.equal(orphaned.ok, true, "reported without failing the run");

        // And the flag turns the whole probe off for a caller that cannot spawn.
        assert.deepEqual(
            (await runDoctor(workspace, { checkPaths: false, checkGit: false })).issues.filter(
                (issue) => issue.code === "verified-commit-unreachable"
            ),
            []
        );
    } finally {
        await rm(root, { recursive: true, force: true });
        await cleanup().catch(() => {});
    }
});
