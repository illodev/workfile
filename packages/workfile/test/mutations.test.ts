import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createTestWorkspace } from "./support/workspace.ts";

import {
    ConflictError,
    archiveCard,
    claimCard,
    createCard,
    loadCards,
    loadWorkspace,
    patchCard,
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
                force: true
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

/** The trail lines on a card, whatever section they ended up under. */
function trail(card) {
    return card.body
        .split("\n")
        .filter((line) => /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2}Z /.test(line));
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
    } finally {
        await cleanup();
    }
});
