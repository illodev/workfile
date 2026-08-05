import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createTestWorkspace } from "./support/workspace.ts";

import {
    ConflictError,
    appendCardNote,
    archiveCard,
    claimCard,
    createCard,
    healMisplacedTrailEntries,
    loadCards,
    misplacedTrailEntries,
    loadWorkspace,
    patchCard,
    patchCardBody,
    releaseCard,
    reopenCard,
    transitionCard
} from "../dist/src/index.js";

const fixture = resolve(
    fileURLToPath(new URL("./fixtures/workspace", import.meta.url))
);

// Delegates rather than repeating the pattern. The local copy returned only
// the root and left disposal to each caller, and one of the four forgot — the
// kind of omission a shared teardown makes impossible rather than unlikely.
async function temporaryWorkspace() {
    return createTestWorkspace({ prefix: "workfile-mutations-" });
}

test("revision tokens reject stale card writes", async () => {
    const { root, workspace } = await temporaryWorkspace();
    try {
        const before = (await loadCards(workspace)).cards.find(
            (card) => card.id === "T-0001"
        );
        const saved = await patchCard(
            workspace,
            "T-0001",
            { priority: "high" },
            { expectedRevision: before.revision }
        );
        assert.equal(saved.card.priority, "high");
        assert.notEqual(saved.revision, before.revision);
        await assert.rejects(
            () =>
                patchCard(
                    workspace,
                    "T-0001",
                    { priority: "low" },
                    { expectedRevision: before.revision }
                ),
            (error) => {
                assert.ok(error instanceof ConflictError);
                assert.equal(error.code, "CARD_WRITE_CONFLICT");
                assert.equal(error.exitCode, 3);
                return true;
            }
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("claim and transition are atomic protocol operations", async () => {
    const { root, workspace } = await temporaryWorkspace();
    try {
        const claimed = await claimCard(workspace, "T-0001", {
            actor: "session-a",
            scope: ["apps/api/src/Billing"],
            now: "2026-07-28T10:00:00.000Z"
        });
        assert.equal(claimed.card.status, "doing");
        assert.equal(claimed.card.claimed_by, "session-a");
        assert.equal(claimed.card.claimed_at, "2026-07-28T10:00:00.000Z");

        await assert.rejects(
            () =>
                claimCard(workspace, "T-0001", {
                    actor: "session-b",
                    now: "2026-07-28T10:30:00.000Z"
                }),
            (error) => error.code === "CARD_ALREADY_CLAIMED"
        );

        const transitioned = await transitionCard(
            workspace,
            "T-0001",
            "review",
            { expectedRevision: claimed.revision }
        );
        assert.equal(transitioned.card.status, "review");
        assert.equal(transitioned.card.claimed_by, undefined);
        assert.equal(transitioned.card.claimed_at, undefined);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("archived cards reopen into the live directory", async () => {
    const { root, workspace } = await temporaryWorkspace();
    try {
        const reopened = await reopenCard(workspace, "T-0002", {
            status: "backlog"
        });
        assert.equal(reopened.card.archived, false);
        assert.equal(reopened.card.status, "backlog");
        const completed = await transitionCard(workspace, "T-0002", "done");
        const archived = await archiveCard(workspace, "T-0002", {
            expectedRevision: completed.revision
        });
        assert.equal(archived.card.archived, true);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

// A client sent `scope: "src/core"` where an array was meant. The written
// scalar was survivable — the next read re-parses it as a list — but the
// mutation's response handed the interface a string whose `.length` passed
// the render guard and whose `.join` crashed the whole board (T-0007).
test("list-typed card fields accept the scalar clients actually send", async () => {
    const { workspace, cleanup } = await temporaryWorkspace();
    try {
        const created = await createCard(workspace, {
            title: "Scalar lists",
            area: "api",
            scope: "src/core,ui",
            tags: "one"
        });
        assert.deepEqual(created.card.scope, ["src/core", "ui"]);
        assert.deepEqual(created.card.tags, ["one"]);

        const patched = await patchCard(workspace, created.id, {
            scope: "un/solo/path"
        });
        assert.deepEqual(patched.card.scope, ["un/solo/path"]);

        const claimed = await claimCard(workspace, created.id, {
            actor: "agent-a",
            scope: "src/api"
        });
        assert.deepEqual(claimed.card.scope, ["src/api"]);
    } finally {
        await cleanup();
    }
});

/**
 * The guard has to read the file, not the listing.
 *
 * `mutateCard` takes an optional `snapshot` so a bulk edit does not re-read the
 * whole directory per card. That listing is read *before* the lock, and for a
 * while the guards were handed the version of the card it remembered — so two
 * agents claiming the same card at the same moment both passed a guard that
 * asked "is this already claimed?" and both wrote. Twelve rounds, twelve
 * double-claims. The loser held a card the file no longer said was theirs.
 *
 * The sequential test above cannot see this: it claims, then claims again, and
 * the second call reloads. Only overlapping calls put a write between the
 * listing and the lock.
 */
test("two agents claiming at once: exactly one wins", async () => {
    for (let round = 0; round < 6; round += 1) {
        const { workspace, cleanup } = await createTestWorkspace({
            prefix: "workfile-race-"
        });
        try {
            const { id } = await createCard(workspace, {
                title: `Contended ${round}`,
                area: "api"
            });

            const settled = await Promise.allSettled([
                claimCard(workspace, id, { actor: "agent-a" }),
                claimCard(workspace, id, { actor: "agent-b" })
            ]);
            const won = settled.filter((result) => result.status === "fulfilled");
            const lost = settled.filter((result) => result.status === "rejected");

            assert.equal(won.length, 1, "a card cannot be held by two actors");
            assert.equal(lost[0].reason.code, "CARD_ALREADY_CLAIMED");

            // And the winner is the one the file agrees with, which is the part
            // that actually matters to whoever reads the card next.
            const { cards } = await loadCards(workspace);
            const stored = cards.find((card) => card.id === id);
            assert.equal(stored.claimed_by, won[0].value.card.claimed_by);
        } finally {
            await cleanup();
        }
    }
});

/**
 * Release and transition carry the same ownership guard, so they inherit the
 * same hole. Archive's terminal-status check is a guard too, written pre-lock.
 */
test("release and transition refuse a foreign claim under contention", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-race-guard-"
    });
    try {
        const { id } = await createCard(workspace, {
            title: "Held by someone else",
            area: "api"
        });
        await claimCard(workspace, id, { actor: "agent-a" });

        for (const attempt of [
            () => transitionCard(workspace, id, "review", { actor: "agent-b" }),
            () => claimCard(workspace, id, { actor: "agent-b" })
        ]) {
            await assert.rejects(attempt, (error: any) => {
                assert.match(
                    error.code,
                    /CARD_CLAIM_OWNER_MISMATCH|CARD_ALREADY_CLAIMED/
                );
                return true;
            });
        }

        // Releasing without an explicit status reads the status from disk, so a
        // card moved to done by its holder is not demoted back to next.
        await transitionCard(workspace, id, "done", { actor: "agent-a" });
        const released = await releaseCard(workspace, id, { actor: "agent-a" });
        assert.equal(released.card.status, "done");
    } finally {
        await cleanup();
    }
});

/**
 * Reopening straight into `doing` was impossible on every surface at once.
 *
 * `reopenCard` forwards to `transitionCard`, which requires an actor to reach
 * `doing` because arriving there takes a claim — and the option was not among
 * the ones it forwarded. So `card reopen ID --status doing` answered
 * `CARD_CLAIM_ACTOR_REQUIRED: actor is required` on a command with no way to
 * supply one, and `project_card_reopen` and the HTTP route inherited it by
 * calling through the same wrapper.
 *
 * A wrapper forwarding some of its target's options and not others is the
 * shape: the caller sees a complete command, and the missing one stays
 * invisible until the single status that needs it is asked for. Pinned at the
 * module and at both servers, because a fix in one place would otherwise leave
 * the other two exactly as they were.
 */
test("reopening into doing carries an actor, on every surface", async () => {
    const { workspace, cleanup } = await createTestWorkspace();
    const { startProjectServer, createMcpProtocolServer } = await import(
        "../dist/src/index.js"
    );
    try {
        const card = await createCard(workspace, {
            title: "Reopened into work",
            type: "task",
            area: "api",
            body: "Body.\n\n## Acceptance criteria\n\n- [ ] Verifiable check\n"
        });
        const park = () =>
            transitionCard(workspace, card.id, "done", {
                actor: "parker",
                force: true,
                reason: "Parked by a test that is about reopening"
            });

        await park();
        const direct = await reopenCard(workspace, card.id, {
            status: "doing",
            actor: "module-caller"
        });
        assert.equal(direct.card.status, "doing");
        assert.equal(direct.card.claimed_by, "module-caller");

        await park();
        const http = await startProjectServer(workspace, { port: 0 });
        try {
            const response = await fetch(
                `${http.url}/api/v2/cards/${card.id}/reopen`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: "doing", actor: "http-caller" })
                }
            );
            // Read once: `await response.text()` inside the assertion message
            // consumes the stream whether or not the assertion fires.
            const payload = await response.text();
            assert.equal(response.status, 200, payload);
            const body = JSON.parse(payload) as any;
            assert.equal(body.record.status, "doing");
            assert.equal(body.record.claimed_by, "http-caller");
        } finally {
            await http.close();
        }

        await park();
        const mcp = createMcpProtocolServer(workspace, { readOnly: false });
        await mcp.handle({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2026-07-28",
                capabilities: {},
                clientInfo: { name: "test", version: "0" }
            }
        });
        const called = await mcp.handle({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
                name: "project_card_reopen",
                arguments: { id: card.id, status: "doing", actor: "mcp-caller" }
            }
        });
        // A JSON-RPC reply is a result or an error, never both, so narrowing is
        // the assertion: "no protocol error" and "no tool error" are different
        // failures and each deserves to say which one happened.
        assert.ok("result" in called, `protocol error: ${JSON.stringify(called)}`);
        const { result } = called;
        assert.equal(result.isError, undefined, JSON.stringify(result));
        assert.equal(result.structuredContent.record.status, "doing");
        assert.equal(result.structuredContent.record.claimed_by, "mcp-caller");

        // An unarchive lands in `backlog`, which claims nothing — but it goes
        // through the same wrapper, and must not start refusing.
        await park();
        const parked = await reopenCard(workspace, card.id, { status: "backlog" });
        assert.equal(parked.card.status, "backlog");
    } finally {
        await cleanup();
    }
});

/**
 * The trail lines on a card.
 *
 * Scoped to `## Activity` rather than matched across the whole body: the lines
 * `card note` appends carry the same timestamp shape, so a card with notes
 * counted them as trail entries.
 */
// Reads the trail the way a reader does, which means skipping fenced blocks: a
// card quoting an example trail used to answer this helper with the quote,
// exactly as it answered the code that wrote into it.
function trail(card) {
    const entries: string[] = [];
    let fence: string | null = null;
    let inside = false;
    for (const line of card.body.split("\n")) {
        const delimiter = /^ {0,3}(`{3,}|~{3,})/.exec(line);
        if (delimiter) {
            const marker = delimiter[1][0];
            if (!fence) fence = marker;
            else if (fence === marker) fence = null;
        } else if (fence) continue;
        else if (/^##(?!#)\s+\S/.test(line)) inside = line.trim() === "## Activity";
        else if (inside && /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2}Z /.test(line))
            entries.push(line);
    }
    return entries;
}

// Nothing asserted on `## Activity` before this, which is how a no-op line got
// in and stayed: the trail is a protocol guarantee — five to fifteen lines over
// a card's whole life, read from a diff months later — and it was the one
// guarantee with no test. A line that records nothing happening is not padding,
// it takes away the reader's ability to tell a real move from a repeated
// command.
test("the durable trail records moves, not commands", async () => {
    const { workspace, cleanup } = await temporaryWorkspace();
    try {
        const created = await createCard(workspace, {
            title: "Trail",
            area: "api",
            type: "task"
        });
        const id = created.id;

        const moved = await transitionCard(workspace, id, "review", {
            actor: "session-a"
        });
        assert.equal(trail(moved.card).length, 1, "a real move writes one line");
        assert.match(trail(moved.card)[0], /backlog → review$/);

        // The reported bug: same status, three times.
        await transitionCard(workspace, id, "review", { actor: "session-a" });
        const again = await transitionCard(workspace, id, "review", {
            actor: "session-a"
        });
        assert.deepEqual(
            trail(again.card),
            trail(moved.card),
            "transitioning to the status a card already has changes nothing"
        );

        // The sequence an agent following the start-work workflow to the letter
        // produces: claim, then a redundant `transition doing` that lands in
        // `claimCard` through the delegation at transitionCard.
        const claimed = await claimCard(workspace, id, { actor: "session-a" });
        assert.equal(trail(claimed.card).length, 2, "the claim is a real move");
        await claimCard(workspace, id, { actor: "session-a" });
        const redundant = await transitionCard(workspace, id, "doing", {
            actor: "session-a"
        });
        assert.equal(
            trail(redundant.card).length,
            2,
            "re-claiming a card you already hold changes nothing"
        );

        // Widening the scope still saves the scope; it is an edit to the card
        // and not a protocol milestone.
        const rescoped = await claimCard(workspace, id, {
            actor: "session-a",
            scope: ["src/api"]
        });
        assert.deepEqual(rescoped.card.scope, ["src/api"]);
        assert.equal(trail(rescoped.card).length, 2);

        // A release drops a real claim; a second one has nothing left to drop.
        const released = await releaseCard(workspace, id, { actor: "session-a" });
        assert.equal(trail(released.card).length, 3, "the release is a real move");
        const twice = await releaseCard(workspace, id, { actor: "session-a" });
        assert.equal(
            trail(twice.card).length,
            3,
            "releasing a card nobody holds changes nothing"
        );

        // And a genuine move still lands, after all that suppression.
        const done = await transitionCard(workspace, id, "backlog", {
            actor: "session-a"
        });
        assert.equal(trail(done.card).length, 4);
        assert.match(trail(done.card)[3], /next → backlog$/);

        // Going into the archive moves the card even though the status reads
        // the same on both sides, so the line is written — and it has to name
        // what happened. `done → done` would be the very thing this test
        // exists to keep out, and writing nothing at all was the asymmetry
        // T-0175 closed: the trail recorded the way back out and not the way
        // in, on the one mutation that takes a card off the board.
        await transitionCard(workspace, id, "done", { actor: "session-a" });
        const filed = await archiveCard(workspace, id, { actor: "session-b" });
        assert.equal(filed.card.archived, true, "the card entered the archive");
        const filedTrail = trail(filed.card);
        assert.match(
            filedTrail[filedTrail.length - 1],
            /session-b · archived$/,
            "archiving names who did it"
        );

        // Idempotent, and the trail says so: the second call returns above the
        // mutation, so there is no second line claiming a second move.
        const refiled = await archiveCard(workspace, id, { actor: "session-b" });
        assert.equal(
            trail(refiled.card).filter((line) => /· archived$/.test(line)).length,
            1,
            "archiving an archived card is not a move"
        );

        await patchCard(workspace, id, { status: "backlog" });
        const restored = await transitionCard(workspace, id, "backlog", {
            actor: "session-a"
        });
        assert.equal(restored.card.archived, false, "the card left the archive");
        const lines = trail(restored.card);
        assert.match(lines[lines.length - 1], /· unarchived$/);
        assert.equal(
            lines.filter((line) => /backlog → backlog|done → done/.test(line)).length,
            0,
            "no line records a move that did not happen"
        );
        // Symmetric either way, which is what the card asked for: both
        // directions are named, and neither is spelled as a status change.
        assert.deepEqual(
            lines.filter((line) => /· (?:un)?archived$/.test(line)).map((line) => line.slice(-9)),
            [" archived", "narchived"]
        );
    } finally {
        await cleanup();
    }
});

// `patchCard` writes frontmatter directly, and `claimed_by` is a frontmatter
// field, so for as long as the ownership rule lived inside `transitionCard` and
// `releaseCard` a patch walked around both. Claims are the whole mechanism by
// which two agents in one checkout stay out of each other's way, so a door that
// skips the check does not weaken the guard, it removes it.
test("a patch cannot take a card another actor is holding", async () => {
    const { workspace, cleanup } = await temporaryWorkspace();
    try {
        const created = await createCard(workspace, {
            title: "Held",
            area: "api",
            type: "task"
        });
        const id = created.id;
        await claimCard(workspace, id, { actor: "alice" });

        // Writing a different name took the card outright, and the trail was
        // left naming the actor who no longer held it.
        await assert.rejects(
            patchCard(
                workspace,
                id,
                {
                    claimed_by: "mallory",
                    claimed_at: "2026-08-02T10:00:00.000Z"
                },
                { actor: "mallory" }
            ),
            (error) => {
                assert.ok(error instanceof ConflictError);
                assert.equal(error.code, "CARD_CLAIM_OWNER_MISMATCH");
                return true;
            }
        );

        // Clearing the claim alongside a status change kept the "claimed cards
        // are doing" invariant satisfied, which is how it slipped past: the
        // invariant was doing the refusing, and only by accident.
        await assert.rejects(
            patchCard(
                workspace,
                id,
                { status: "review", claimed_by: null, claimed_at: null },
                { actor: "mallory" }
            ),
            (error) => {
                assert.ok(error instanceof ConflictError);
                assert.equal(error.code, "CARD_CLAIM_OWNER_MISMATCH");
                return true;
            }
        );

        const held = (await loadCards(workspace)).cards.find(
            (card) => card.id === id
        );
        assert.equal(held.claimed_by, "alice", "the card is still alice's");
        assert.equal(held.status, "doing");

        // A field neither `transition` nor `release` ever defended stays
        // patchable: this is the missing half of an old rule, not a new one.
        const triaged = await patchCard(
            workspace,
            id,
            { priority: "high" },
            { actor: "mallory" }
        );
        assert.equal(triaged.card.priority, "high");
        assert.equal(triaged.card.claimed_by, "alice");

        // Taking it over deliberately still works, and still says why.
        const taken = await claimCard(workspace, id, {
            actor: "bob",
            force: true,
            reason: "alice is out"
        });
        assert.equal(taken.card.claimed_by, "bob");
        assert.match(taken.card.body, /bob replaced alice's claim: alice is out/);

        // And a patch that does let the card go now records it, so the trail
        // no longer depends on which command was used.
        const let_go = await patchCard(
            workspace,
            id,
            { status: "review", claimed_by: null, claimed_at: null },
            { actor: "bob" }
        );
        const lines = trail(let_go.card);
        assert.match(lines[lines.length - 1], /bob · released$/);
        assert.match(lines[lines.length - 2], /doing → review$/);
    } finally {
        await cleanup();
    }
});

// The trail and the notes live in the body, and a body write replaced the
// body — so `project_card_write`, an agent-facing tool whose whole purpose is
// replacing a body, erased the record of who moved the card and why. "Durable"
// held only until the first agent used it.
test("a body write cannot erase the protocol sections", async () => {
    const { workspace, cleanup } = await temporaryWorkspace();
    try {
        const created = await createCard(workspace, {
            title: "Body",
            area: "api",
            type: "task"
        });
        const id = created.id;
        await claimCard(workspace, id, { actor: "alice" });
        await claimCard(workspace, id, {
            actor: "bob",
            force: true,
            reason: "alice is out"
        });
        await appendCardNote(workspace, id, { text: "human context" });

        // A caller that simply does not send them cannot delete them.
        const replaced = await patchCardBody(workspace, id, {
            body: "a new body"
        });
        assert.match(replaced.card.body, /^a new body/);
        assert.equal(trail(replaced.card).length, 2, "the trail survives");
        assert.match(replaced.card.body, /bob replaced alice's claim: alice is out/);
        assert.match(replaced.card.body, /human context/);

        // Round-tripping the body faithfully gives back exactly what was sent.
        const again = await patchCardBody(workspace, id, {
            body: replaced.card.body
        });
        assert.equal(again.card.body.trim(), replaced.card.body.trim());

        // And a caller that hands back a shortened trail cannot shorten it:
        // the section is append-only, so the stored copy wins.
        const truncated = await patchCardBody(workspace, id, {
            body: "another body\n\n## Activity\n\n- 2026-08-02 10:00Z alice · claimed\n"
        });
        assert.equal(trail(truncated.card).length, 2, "the trail cannot be cut");
        assert.match(truncated.card.body, /^another body/);
        assert.match(truncated.card.body, /bob · claimed/);

        // A card with no protocol sections still writes plainly.
        const plain = await createCard(workspace, { title: "Plain", area: "api" });
        const written = await patchCardBody(workspace, plain.id, {
            body: "just prose"
        });
        assert.equal(written.card.body.trim(), "just prose");
    } finally {
        await cleanup();
    }
});

// The guard above was positional: it kept the stored body from the first
// protocol heading *to the end of the document*. So a card with anything below
// its notes — acceptance criteria, in practice — had a section nothing could
// rewrite, and `card write` said it had written it. This is T-0157's repro.
test("a body write reaches the sections below the protocol ones", async () => {
    const { workspace, cleanup } = await temporaryWorkspace();
    try {
        const created = await createCard(workspace, {
            title: "Criteria under notes",
            area: "api",
            body: [
                "Original prose.",
                "",
                "## Notes",
                "",
                "- Old note.",
                "",
                "## Acceptance criteria",
                "",
                "- [ ] old criterion"
            ].join("\n")
        });

        const result = await patchCardBody(workspace, created.id, {
            body: [
                "REWRITTEN prose.",
                "",
                "## Notes",
                "",
                "- Old note.",
                "",
                "## Acceptance criteria",
                "",
                "- [ ] corrected criterion"
            ].join("\n")
        });

        assert.match(result.card.body, /REWRITTEN prose/);
        assert.match(result.card.body, /- \[ \] corrected criterion/);
        assert.doesNotMatch(result.card.body, /old criterion/);
        // The note is still carried over from the stored copy, and the write
        // that reached past it was not reported as partial.
        assert.match(result.card.body, /- Old note\./);
        assert.deepEqual(result.ignored, []);
    } finally {
        await cleanup();
    }
});

// The same positional read found headings inside fenced code blocks. T-0157's
// own body quotes a repro containing `## Notes`, so the card describing this
// bug was one of the cards it made unwritable.
test("a heading inside a fenced block is prose, not a protocol section", async () => {
    const { workspace, cleanup } = await temporaryWorkspace();
    try {
        const created = await createCard(workspace, {
            title: "Quotes a body",
            area: "api",
            body: [
                "## Reproduced",
                "",
                "```text",
                "## Notes",
                "",
                "Old note.",
                "```",
                "",
                "## Why it matters",
                "",
                "Because the quote is not a section."
            ].join("\n")
        });
        await appendCardNote(workspace, created.id, { text: "a real note" });

        const result = await patchCardBody(workspace, created.id, {
            body: [
                "## Reproduced",
                "",
                "```text",
                "## Notes",
                "",
                "Old note.",
                "```",
                "",
                "## Why it matters",
                "",
                "REWRITTEN reasoning."
            ].join("\n")
        });

        assert.match(result.card.body, /REWRITTEN reasoning/);
        assert.doesNotMatch(result.card.body, /Because the quote is not a section/);
        // And the real note, which lives below all of it, is still there.
        assert.match(result.card.body, /a real note/);
        assert.deepEqual(result.ignored, []);
    } finally {
        await cleanup();
    }
});

// The trail and `card note` located their heading the same way, so a card
// quoting one wrote *into the quote*: the claim line landed inside a fenced
// block, where a reader sees it as literal text and `trail()` never finds it.
// The card documenting the bug is exactly this shape.
test("the trail is appended to a section, not into a quoted one", async () => {
    const { workspace, cleanup } = await temporaryWorkspace();
    try {
        const created = await createCard(workspace, {
            title: "Quotes a trail",
            area: "api",
            body: [
                "How a trail looks:",
                "",
                "```text",
                "## Activity",
                "",
                "- 2026-01-01 00:00Z someone · claimed",
                "```"
            ].join("\n")
        });
        await claimCard(workspace, created.id, { actor: "alice" });
        const moved = await transitionCard(workspace, created.id, "review", {
            actor: "alice"
        });

        const fence = moved.card.body.indexOf("```text");
        const closing = moved.card.body.indexOf("```", fence + 7);
        const quoted = moved.card.body.slice(fence, closing);
        assert.doesNotMatch(quoted, /alice/, "the trail was written into the quote");

        const entries = trail(moved.card);
        assert.equal(entries.length, 2);
        assert.match(entries[1], /doing → review$/);
        // And the quote survives intact, because it is prose.
        assert.match(moved.card.body, /- 2026-01-01 00:00Z someone · claimed/);
    } finally {
        await cleanup();
    }
});

// The instance that actually happened, four times, in this repository. The
// cards written *about* the trail are the cards that name it in prose, so
// `indexOf("## Activity")` found it inside a sentence — and T-0108's entire
// four-entry trail ended up in its second paragraph, with no section at all.
test("a heading quoted inline is not where the trail goes", async () => {
    const { workspace, cleanup } = await temporaryWorkspace();
    try {
        const created = await createCard(workspace, {
            title: "Names the trail",
            area: "api",
            body: [
                "`card transition` appends `review → review` to `## Activity`",
                "even when nothing moved.",
                "",
                "## Reproduced",
                "",
                "Three identical transitions, three lines."
            ].join("\n")
        });
        await claimCard(workspace, created.id, { actor: "alice" });

        const entries = trail((await loadCards(workspace)).cards.find(
            (card) => card.id === created.id
        ));
        assert.equal(entries.length, 1, "the claim landed somewhere else");
        assert.match(entries[0], /claimed$/);
        // The sentence that names the heading is untouched prose.
        assert.match(
            (await loadCards(workspace)).cards.find((card) => card.id === created.id)
                .body,
            /appends `review → review` to `## Activity`\neven when nothing moved\./
        );
    } finally {
        await cleanup();
    }
});

// Silence over a half-applied write is the failure shape this repository has
// named the worst available: the instruction evaporates and the exit code says
// it worked. The sections stay append-only; they stop being quiet about it.
test("a body write names the protocol sections it declined to take", async () => {
    const { workspace, cleanup } = await temporaryWorkspace();
    try {
        const created = await createCard(workspace, { title: "Named", area: "api" });
        await claimCard(workspace, created.id, { actor: "alice" });
        await appendCardNote(workspace, created.id, { text: "human context" });

        const edited = await patchCardBody(workspace, created.id, {
            body: "prose\n\n## Notes\n\n- rewritten note\n"
        });
        assert.deepEqual(edited.ignored, ["## Notes"]);
        assert.match(edited.card.body, /human context/);
        assert.doesNotMatch(edited.card.body, /rewritten note/);

        // Inventing a section the card does not have is the same answer: the
        // protocol commands are the only writers of a trail.
        const plain = await createCard(workspace, { title: "Plain", area: "api" });
        const fabricated = await patchCardBody(workspace, plain.id, {
            body: "prose\n\n## Activity\n\n- 2026-08-05 10:00Z mallory · claimed\n"
        });
        assert.deepEqual(fabricated.ignored, ["## Activity"]);
        assert.equal(fabricated.card.body.trim(), "prose");

        // A faithful round trip stays quiet.
        const again = await patchCardBody(workspace, created.id, {
            body: edited.card.body
        });
        assert.deepEqual(again.ignored, []);
    } finally {
        await cleanup();
    }
});

// The repair for what the positional search already wrote. It is deliberately
// the only way back: the entries are prose now, so `card write` can delete
// them but cannot put them where the protocol owns the section.
test("doctor --fix moves stray trail entries back into the trail", async () => {
    const { workspace, cleanup } = await temporaryWorkspace();
    try {
        const created = await createCard(workspace, {
            title: "Damaged before the fix",
            area: "api",
            body: [
                "Prose about `## Activity`.",
                "- 2026-08-02 16:56Z alice · claimed",
                "- 2026-08-02 17:07Z alice · doing → done",
                "",
                "## Reproduced",
                "",
                "```text",
                "- 2026-01-01 00:00Z quoted · claimed",
                "```",
                "",
                "## Notes",
                "",
                // A note is not a trail entry, and the one subject that makes
                // a note quote one is the trail. Told apart by the separator
                // that follows the actor: `—` here, `·` above. Before this,
                // the greedy `.+ · ` found the middot inside the quote and
                // `--fix` moved the evidence out of the section it was
                // deliberately written into.
                "- 2026-08-02 17:20Z alice — the line reads `2026-01-01 00:00Z bob · claimed`"
            ].join("\n")
        });

        const before = (await loadCards(workspace)).cards.find(
            (card) => card.id === created.id
        );
        assert.equal(misplacedTrailEntries(before.body).length, 2);

        const healed = await healMisplacedTrailEntries(workspace, { actor: "doctor" });
        assert.deepEqual(healed.moved, [{ id: created.id, entries: 2 }]);

        const after = (await loadCards(workspace)).cards.find(
            (card) => card.id === created.id
        );
        assert.deepEqual(misplacedTrailEntries(after.body), []);
        const entries = trail(after);
        // Both moved, in order, plus the line recording the repair itself.
        assert.equal(entries.length, 3);
        assert.match(entries[0], /alice · claimed$/);
        assert.match(entries[1], /alice · doing → done$/);
        assert.match(entries[2], /doctor · moved 2 trail entries into the trail$/);
        // The quoted one is an example, not damage, and stays where it is.
        assert.match(after.body, /- 2026-01-01 00:00Z quoted · claimed/);
        // And so does the note that quotes one inline, which no fence protects.
        assert.match(
            after.body,
            /## Notes\n\n- 2026-08-02 17:20Z alice — the line reads/,
            "a note that quotes a trail entry is not a trail entry"
        );
        assert.match(after.body, /^Prose about `## Activity`\.$/m);

        // And a second pass has nothing left to do.
        assert.deepEqual(
            (await healMisplacedTrailEntries(workspace, { actor: "doctor" })).moved,
            []
        );
    } finally {
        await cleanup();
    }
});

// CI runs Windows and the developers do not, so a card written with CRLF is a
// shape no local run ever produces. Sections are joined with `\n`, which left
// `\r\n` inside each section and a bare `\n` between them — one file, two
// kinds of line ending, from a command that claimed to touch one section.
test("a card written with CRLF keeps its line endings", async () => {
    const { workspace, cleanup } = await temporaryWorkspace();
    try {
        const created = await createCard(workspace, {
            title: "Written on Windows",
            area: "api",
            body: "Prose.\n\n## Acceptance criteria\n\n- [ ] something"
        });
        const path = join(
            workspace.paths.cards,
            (await loadCards(workspace)).cards.find(
                (card) => card.id === created.id
            ).file
        );
        const asWindows = (await readFile(path, "utf8")).replace(/\r?\n/g, "\r\n");
        await writeFile(path, asWindows);

        await claimCard(workspace, created.id, { actor: "alice" });
        await appendCardNote(workspace, created.id, { text: "a note" });
        await patchCardBody(workspace, created.id, {
            body: "Rewritten prose.\r\n\r\n## Acceptance criteria\r\n\r\n- [ ] something"
        });

        const written = await readFile(path, "utf8");
        assert.match(written, /Rewritten prose\./);
        assert.match(written, /## Activity/);
        assert.equal(
            /[^\r]\n/.test(written),
            false,
            "a bare newline survived in a CRLF card"
        );
    } finally {
        await cleanup();
    }
});
