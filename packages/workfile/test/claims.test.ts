import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createTestWorkspace } from "./support/workspace.ts";

import {
    buildActivitySnapshot,
    claimCard,
    claimSeparation,
    claimSession,
    claimState,
    createCard,
    loadCards,
    loadWorkspace,
    pruneAgentSessions,
    readAgentSessions,
    recordAgentSignal,
    releaseCard,
    runDoctor,
    transitionCard
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

// Releasing a claim rewrote the card to `next` unconditionally, so the natural
// order of finishing — transition to done, then let go of the claim — silently
// demoted the card it had just closed. Nobody noticed until a board showed a
// finished release back in the queue (T-0004).
test("releasing a claim keeps the status the card already reached", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-release-"
    });
    try {
        const finished = await createCard(workspace, {
            title: "Finished",
            area: "api"
        });
        await claimCard(workspace, finished.id, { actor: "agent-a" });
        await transitionCard(workspace, finished.id, "done", {
            actor: "agent-a"
        });
        const released = await releaseCard(workspace, finished.id, {
            actor: "agent-a"
        });
        assert.equal(released.card.status, "done", "done survives the release");
        assert.ok(!released.card.claimed_by);

        // `doing` is the one status that cannot outlive its claimant: active
        // work with nobody on it is a contradiction, so it returns to `next`.
        const active = await createCard(workspace, {
            title: "Active",
            area: "api"
        });
        await claimCard(workspace, active.id, { actor: "agent-a" });
        await transitionCard(workspace, active.id, "doing", {
            actor: "agent-a"
        });
        const back = await releaseCard(workspace, active.id, {
            actor: "agent-a"
        });
        assert.equal(back.card.status, "next");

        // An explicit target still wins over both defaults.
        const parked = await createCard(workspace, {
            title: "Parked",
            area: "api"
        });
        await claimCard(workspace, parked.id, { actor: "agent-a" });
        const blocked = await releaseCard(workspace, parked.id, {
            actor: "agent-a",
            status: "blocked"
        });
        assert.equal(blocked.card.status, "blocked");
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

/**
 * T-0206: the skip that decided a conflict compared actors, not processes.
 *
 * `resolveActor` writes a session discriminator into the actor's tail, so two
 * agents *usually* differ and the old comparison looked right. Two plain
 * terminals both resolve to `user@host`, and two agents handed the same
 * `--actor` both resolve to that — in each case the pair was dropped as one
 * person, and each is two processes about to overwrite each other.
 */
test("what separates two claims is the session, and it names its own evidence", () => {
    // A full session id from a session file and an eight-character tail from an
    // actor are the same session; if these ever normalise differently the whole
    // comparison starts answering "different" for one process.
    assert.equal(
        claimSession({ by: "solo@box#e55eab30", sessionId: null }),
        "e55eab30"
    );
    assert.equal(
        claimSession({ by: "solo@box", sessionId: "E55EAB30-b661-4290-bd58" }),
        "e55eab30"
    );
    assert.equal(claimSession({ by: "solo@box", sessionId: null }), null);

    const same = { by: "solo@box#aaaaaaaa", sessionId: null };
    const other = { by: "solo@box#bbbbbbbb", sessionId: null };
    assert.equal(claimSeparation(same, { ...same }), null, "one session");

    // The case the old rule missed: one actor string, two sessions.
    assert.equal(
        claimSeparation(
            { by: "shared", sessionId: "sess-a" },
            { by: "shared", sessionId: "sess-b" }
        ),
        "sessions-differ"
    );
    assert.equal(claimSeparation(same, other), "sessions-differ");
    assert.equal(
        claimSeparation(same, { by: "solo@box", sessionId: null }),
        "sessions-differ",
        "a session on one side is still two processes"
    );

    // No session either side. Different actors are two people; the same actor is
    // the case nothing in the workspace can decide.
    assert.equal(
        claimSeparation(
            { by: "alvaro@box", sessionId: null },
            { by: "other@box", sessionId: null }
        ),
        "actors-differ"
    );
    assert.equal(
        claimSeparation(
            { by: "solo@box", sessionId: null },
            { by: "solo@box", sessionId: null }
        ),
        "unproven"
    );

    // T-0229: one side is a live process and the other a board row, and only
    // the live side ever resolves a session. Reading the row's `null` as "has
    // no session" made this `sessions-differ` — a verdict over two identities
    // the workspace cannot tell apart, and the reason the scope guard prompted
    // agents about their own cards. The actors are the only evidence, so the
    // actors decide.
    assert.equal(
        claimSeparation(
            { by: "drain-web-tools", sessionId: null },
            { by: "drain-web-tools", sessionId: "5e16bd6e-1111-4222-8333-4444" }
        ),
        "unproven",
        "the same declared actor with one session seen is a guess, not a verdict"
    );
    // A different declared actor still separates, and keeps the stronger label:
    // one side resolved a session, so these are two processes and not merely two
    // names. That is why the fix reorders the tests instead of dropping one.
    assert.equal(
        claimSeparation(
            { by: "drain-client-import", sessionId: null },
            { by: "drain-web-tools", sessionId: "5e16bd6e-1111-4222-8333-4444" }
        ),
        "sessions-differ",
        "a different declared actor still separates"
    );
});

test("two terminals sharing one actor are reported, marked as unproven", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-claims-unproven-"
    });
    try {
        const first = await createCard(workspace, { title: "One", area: "api" });
        const second = await createCard(workspace, { title: "Two", area: "api" });
        // Exactly what two plain terminals write: no session, so no tail.
        await claimCard(workspace, first.id, {
            actor: "solo@box",
            scope: ["src/api"]
        });
        await claimCard(workspace, second.id, {
            actor: "solo@box",
            scope: ["src/api/billing"]
        });

        const { cards } = await loadCards(workspace);
        const snapshot = await buildActivitySnapshot(workspace, cards);

        // Before this the pair was dropped: two processes overwriting each other
        // with nothing anywhere saying so.
        assert.equal(snapshot.conflicts.length, 1);
        assert.deepEqual(snapshot.conflicts[0].cards.sort(), [
            first.id,
            second.id
        ].sort());
        assert.equal(
            snapshot.conflicts[0].basis,
            "unproven",
            "one person with two cards is the same record as two terminals racing"
        );
    } finally {
        await cleanup();
    }
});

test("one actor string over two sessions is a conflict, and one session is not", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-claims-sessions-"
    });
    try {
        const left = await createCard(workspace, { title: "Left", area: "api" });
        const right = await createCard(workspace, { title: "Right", area: "api" });
        // Two agents handed the same `--actor`, which is what the protocol used
        // to teach. The actor cannot tell them apart; the sessions can.
        await claimCard(workspace, left.id, {
            actor: "shared-agent",
            scope: ["src/api"]
        });
        await claimCard(workspace, right.id, {
            actor: "shared-agent",
            scope: ["src/api/billing"]
        });
        await recordAgentSignal(workspace, {
            sessionId: "aaaaaaaa-1111",
            actor: "shared-agent",
            cardId: left.id,
            files: ["src/api/billing.ts"]
        });
        await recordAgentSignal(workspace, {
            sessionId: "bbbbbbbb-2222",
            actor: "shared-agent",
            cardId: right.id,
            files: ["src/api/billing.ts"]
        });

        const { cards } = await loadCards(workspace);
        const snapshot = await buildActivitySnapshot(workspace, cards);
        assert.equal(snapshot.conflicts.length, 1);
        assert.equal(snapshot.conflicts[0].basis, "sessions-differ");

        // And the other half of the rule: one session holding both overlapping
        // cards is not colliding with itself. Attribution has to prefer the
        // session that names the card — as a single `find` over an `||` this
        // returned whichever session came first, so both cards could be
        // attributed to one session and a real conflict disappeared.
        const solo = await createTestWorkspace({
            prefix: "workfile-claims-solo-"
        });
        try {
            const a = await createCard(solo.workspace, {
                title: "A",
                area: "api"
            });
            const b = await createCard(solo.workspace, {
                title: "B",
                area: "api"
            });
            for (const card of [a, b]) {
                await claimCard(solo.workspace, card.id, {
                    actor: "solo@box#cccccccc",
                    scope: ["src/api"]
                });
            }
            const listing = await loadCards(solo.workspace);
            const own = await buildActivitySnapshot(
                solo.workspace,
                listing.cards
            );
            assert.deepEqual(own.conflicts, []);
        } finally {
            await solo.cleanup();
        }
    } finally {
        await cleanup();
    }
});
