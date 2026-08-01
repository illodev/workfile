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
