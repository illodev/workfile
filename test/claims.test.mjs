import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createTestWorkspace } from "./support/workspace.mjs";

import {
    buildActivitySnapshot,
    claimCard,
    claimState,
    createCard,
    loadCards,
    loadWorkspace,
    pruneAgentSessions,
    readAgentSessions,
    recordAgentSignal,
    runDoctor
} from "../dist/src/index.js";

const fixture = resolve(
    fileURLToPath(new URL("./fixtures/workspace", import.meta.url))
);

// A claim was a flag nothing ever revisited. An agent that died mid-task left
// its card in `doing` forever: `doctor` reported no problem, and the next agent
// found out only by being refused — and was then asked for a reason to break a
// claim held by a process that had been gone for days.
test("a claim's state distinguishes live work from an abandoned card", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-claims-"
    });
    try {
        const live = await createCard(workspace, { title: "Live", area: "api" });
        const abandoned = await createCard(workspace, {
            title: "Abandoned",
            area: "api"
        });
        await claimCard(workspace, live.id, { actor: "agent-live" });
        await claimCard(workspace, abandoned.id, { actor: "agent-gone" });

        // The heartbeat lives in the cache, not in the card: refreshing a
        // timestamp in frontmatter every minute would leave the working tree
        // permanently dirty.
        await recordAgentSignal(workspace, {
            sessionId: "sess-live",
            actor: "agent-live",
            cardId: live.id,
            files: ["src/api/billing.ts"]
        });

        const sessions = await readAgentSessions(workspace);
        assert.equal(sessions.length, 1);
        assert.equal(sessions[0].live, true);
        assert.deepEqual(sessions[0].filesTouched, ["src/api/billing.ts"]);

        const { cards } = await loadCards(workspace);
        const byId = (id) => cards.find((card) => card.id === id);
        const options = { leaseHours: 24, now: new Date() };

        assert.equal(
            claimState(byId(live.id), sessions, options).state,
            "live",
            "a signalling session means the card is actually being worked on"
        );
        assert.equal(
            claimState(byId(abandoned.id), sessions, options).state,
            "held",
            "no signal but inside the lease is not yet a problem"
        );
        assert.equal(
            claimState(
                byId(abandoned.id),
                sessions,
                { leaseHours: 24, now: new Date(Date.now() + 26 * 3_600_000) }
            ).state,
            "stale"
        );

        // An unclaimed card has no state to report.
        const free = await createCard(workspace, { title: "Free", area: "api" });
        const { cards: after } = await loadCards(workspace);
        assert.equal(
            claimState(
                after.find((card) => card.id === free.id),
                sessions,
                options
            ).state,
            "unclaimed"
        );
    } finally {
        await cleanup();
    }
});

test("the doctor reports claims past their lease", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-lease-"
    });
    try {
        const card = await createCard(workspace, {
            title: "Held too long",
            area: "api"
        });
        await claimCard(workspace, card.id, { actor: "agent-gone" });

        // `doctor` did not contain the word "claim" anywhere.
        const now = await runDoctor(workspace);
        assert.equal(
            now.issues.filter((issue) => issue.code.startsWith("card-claim"))
                .length,
            0,
            "a fresh claim is not a problem"
        );

        const later = await runDoctor(workspace, {
            now: new Date(Date.now() + 26 * 3_600_000)
        });
        const stale = later.issues.find(
            (issue) => issue.code === "card-claim-stale"
        );
        assert.ok(stale, "a claim past its lease must be reported");
        assert.equal(stale.id, card.id);
        assert.equal(stale.severity, "warning");
        assert.match(stale.message, /agent-gone/);
        assert.match(stale.message, /24h lease/);
    } finally {
        await cleanup();
    }
});

test("session records are bounded and prunable", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-sessions-"
    });
    try {

        // Touched files accumulate across signals but stay a ring, not a log:
        // this is a presence indicator, not an audit trail.
        for (let index = 0; index < 80; index += 1) {
            await recordAgentSignal(workspace, {
                sessionId: "sess-busy",
                actor: "agent",
                files: [`src/file-${index}.ts`]
            });
        }
        const [session] = await readAgentSessions(workspace);
        assert.equal(session.filesTouched.length, 50);
        assert.equal(session.filesTouched.at(-1), "src/file-79.ts");

        // An old session is swept rather than kept forever.
        await recordAgentSignal(workspace, {
            sessionId: "sess-ancient",
            actor: "agent",
            now: new Date(Date.now() - 2 * 86_400_000)
        });
        assert.equal((await readAgentSessions(workspace)).length, 2);
        const { removed } = await pruneAgentSessions(workspace, {
            olderThanMs: 86_400_000
        });
        assert.equal(removed, 1);
        const remaining = await readAgentSessions(workspace);
        assert.deepEqual(
            remaining.map((entry) => entry.sessionId),
            ["sess-busy"]
        );
    } finally {
        await cleanup();
    }
});

// Three signals already existed and nothing combined them: the lock files
// `withFileLock` writes (which live exactly as long as a write does), the
// durable claims in frontmatter, and the session heartbeats. The interface
// reduced all of it to a padlock emoji on a card.
test("the activity snapshot answers who is working on what", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-activity-"
    });
    try {

        const api = await createCard(workspace, {
            title: "Billing API",
            area: "api"
        });
        const web = await createCard(workspace, {
            title: "Web client",
            area: "web"
        });
        await claimCard(workspace, api.id, {
            actor: "agent-a",
            scope: ["src/api"]
        });
        await claimCard(workspace, web.id, {
            actor: "agent-b",
            // Deliberately overlapping: this is the situation claims exist to
            // prevent, and it was computed on claim and then discarded.
            scope: ["src/api/billing", "src/web"]
        });
        await recordAgentSignal(workspace, {
            sessionId: "sess-a",
            actor: "agent-a",
            cardId: api.id,
            files: ["src/api/billing.ts"]
        });

        const { cards } = await loadCards(workspace);
        const snapshot = await buildActivitySnapshot(workspace, cards);

        assert.equal(snapshot.claims.length, 2);
        const byId = (id) =>
            snapshot.claims.find((entry) => entry.id === id);
        assert.equal(
            byId(api.id).claim.state,
            "live",
            "a signalling session is working, not merely claiming"
        );
        assert.equal(byId(web.id).claim.state, "held");

        assert.equal(snapshot.sessions.length, 1);
        assert.equal(snapshot.sessions[0].actor, "agent-a");
        assert.deepEqual(snapshot.sessions[0].filesTouched, [
            "src/api/billing.ts"
        ]);

        assert.equal(snapshot.conflicts.length, 1);
        assert.deepEqual(snapshot.conflicts[0].cards.sort(), [api.id, web.id].sort());
        assert.deepEqual(snapshot.conflicts[0].paths, ["src/api"]);

        // Two cards claimed by the *same* actor are not a conflict: an agent
        // working on two things is not colliding with itself.
        const third = await createCard(workspace, {
            title: "Also mine",
            area: "api"
        });
        await claimCard(workspace, third.id, {
            actor: "agent-a",
            scope: ["src/api"]
        });
        const { cards: after } = await loadCards(workspace);
        const second = await buildActivitySnapshot(workspace, after);
        assert.equal(
            second.conflicts.filter((conflict) =>
                conflict.cards.includes(third.id)
            ).length,
            1,
            "still only conflicts with agent-b, not with agent-a's own card"
        );
    } finally {
        await cleanup();
    }
});
