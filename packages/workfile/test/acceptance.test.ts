import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createTestWorkspace, withServer } from "./support/workspace.ts";

import {
    applyAcceptance,
    claimCard,
    createCard,
    createMcpProtocolServer,
    loadCards,
    loadWorkspace,
    MCP_LEGACY_PROTOCOL_VERSION,
    parseAcceptance,
    patchCard,
    patchCardBody,
    releaseCard,
    setCardAcceptance,
    transitionCard,
    unreadableCriteria
} from "../dist/src/index.js";

const fixture = resolve(
    fileURLToPath(new URL("./fixtures/workspace", import.meta.url))
);

const BODY = [
    "Some prose the author wrote, which is not ours to reformat.",
    "",
    "## Acceptance criteria",
    "",
    "- [ ] The first thing",
    "* [x] The second, with a different bullet",
    "  - [ ]   The third, indented, with extra spacing",
    "",
    "### A nested heading stays inside",
    "",
    "- [ ] The fourth",
    "",
    "## Notes",
    "",
    "- [ ] This box is not a criterion",
    ""
].join("\n");

test("the acceptance region is read, and stops where the section does", () => {
    const reading = parseAcceptance(BODY);
    assert.equal(reading.present, true);
    assert.equal(reading.items.length, 4, "a checkbox under ## Notes is not a criterion");
    assert.deepEqual(
        reading.items.map((item) => [item.index, item.checked]),
        [
            [1, false],
            [2, true],
            [3, false],
            [4, false]
        ]
    );
    assert.equal(reading.items[2].text, "The third, indented, with extra spacing");
    assert.equal(reading.unchecked.length, 3);

    // A card that never declares the section is a different thing from one that
    // declares it empty, and the doctor should not treat them alike. Prose with
    // no boxes anywhere really does declare nothing — that reading is honest,
    // and it is the only case in which it is.
    assert.deepEqual(parseAcceptance("no section here"), {
        present: false,
        items: [],
        unchecked: [],
        orphans: []
    });
    assert.equal(parseAcceptance("## Acceptance criteria\n").present, true);
});

test("writing a criterion touches the box and nothing else", () => {
    const { body, changed } = applyAcceptance(BODY, { check: [1, 3] });
    assert.equal(changed.length, 2);

    const before = BODY.split("\n");
    const after = body.split("\n");
    const differing = after
        .map((line, index) => (line === before[index] ? null : index))
        .filter((index) => index !== null);
    assert.equal(differing.length, 2, "only the two lines asked for may move");

    // Bullet character, indentation and spacing all survive: the record format
    // promises a write touches only what it claims to.
    assert.equal(after[4], "- [x] The first thing");
    assert.equal(after[6], "  - [x]   The third, indented, with extra spacing");

    // Checking something already checked is not an edit.
    assert.deepEqual(applyAcceptance(BODY, { check: [2] }).changed, []);

    // Last instruction wins, so a caller gets what it last said.
    const both = applyAcceptance(BODY, { check: [1], uncheck: [1] });
    assert.deepEqual(both.changed, []);
    assert.equal(both.body, BODY);

    // Silently dropping an index is the failure an agent cannot detect.
    assert.throws(() => applyAcceptance(BODY, { check: [9] }), {
        code: "CARD_ACCEPTANCE_INDEX_UNKNOWN"
    });
});

/**
 * The rule this exists for: `done` means verified where it actually runs. It
 * had one doctor warning behind it, on a card that had already shipped.
 */
test("done refuses while criteria are unproven, and force still gets through", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-ac-"));
    try {
        await cp(fixture, root, { recursive: true });
        const workspace = await loadWorkspace({ root });
        const created = await createCard(workspace, { title: "Proven work", area: "api" });
        await patchCardBody(workspace, created.id, { body: BODY });

        await assert.rejects(
            () => transitionCard(workspace, created.id, "done", { actor: "tester" }),
            (error: any) => {
                assert.equal(error.code, "CARD_ACCEPTANCE_UNMET");
                assert.equal(error.details.unchecked.length, 3);
                assert.match(error.message, /#1 The first thing/);
                return true;
            }
        );

        // A status that is not `done` is not gated: work in progress is allowed
        // to be in progress.
        await transitionCard(workspace, created.id, "review", { actor: "tester" });

        const checked = await setCardAcceptance(workspace, created.id, {
            check: [1, 3, 4]
        });
        assert.equal(checked.changed.length, 3);
        assert.equal(checked.acceptance.unchecked.length, 0);

        const done = await transitionCard(workspace, created.id, "done", {
            actor: "tester"
        });
        assert.equal(done.card.status, "done");

        // And the escape hatch, because some criteria do not survive contact.
        const second = await createCard(workspace, { title: "Forced", area: "api" });
        await patchCardBody(workspace, second.id, { body: BODY });
        await assert.rejects(
            () =>
                transitionCard(workspace, second.id, "done", {
                    actor: "tester",
                    force: true
                }),
            (error: any) => {
                assert.equal(error.code, "CARD_FORCE_REASON_REQUIRED");
                return true;
            }
        );
        const forced = await transitionCard(workspace, second.id, "done", {
            actor: "tester",
            force: true,
            reason: "The last two need hardware this repository does not have"
        });
        assert.equal(forced.card.status, "done");
        assert.match(
            forced.card.body,
            /· backlog → done \(forced past 3 unproven criteria: The last two need hardware this repository does not have\)/
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a stale revision cannot address a criterion by the wrong number", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-ac-rev-"));
    try {
        await cp(fixture, root, { recursive: true });
        const workspace = await loadWorkspace({ root });
        const created = await createCard(workspace, { title: "Reordered", area: "api" });
        await patchCardBody(workspace, created.id, { body: BODY });

        const { cards } = await loadCards(workspace);
        const stale = cards.find((card) => card.id === created.id).revision;

        // Somebody reorders the list. Positional indices now mean something
        // else — which is exactly why this write carries a revision.
        await patchCardBody(workspace, created.id, {
            body: BODY.replace("- [ ] The first thing", "- [ ] Inserted ahead of it\n- [ ] The first thing")
        });

        await assert.rejects(
            () =>
                setCardAcceptance(workspace, created.id, {
                    check: [1],
                    expectedRevision: stale
                }),
            (error: any) => {
                assert.match(error.code, /REVISION|STALE|CONFLICT/i);
                return true;
            }
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * `done` had one gate and four doors.
 *
 * T-0084 put the acceptance check inside `transitionCard`, which is the door a
 * human uses. `card patch`, both HTTP PATCH routes and `project_card_patch` set
 * `status` directly through `patchCard` and never reached it — so the rule the
 * README leads with was enforced on the one surface agents do not use. The same
 * omission dropped the Activity line: a card could read `status: done` with a
 * trail whose last entry said "claimed".
 */
test("every door to done passes the same gate, and leaves the same trail", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-ac-doors-"
    });
    try {
        const unproven = async (title) => {
            const { id } = await createCard(workspace, { title, area: "api" });
            await patchCardBody(workspace, id, { body: BODY });
            return id;
        };

        // The library layer every surface calls.
        for (const [door, attempt] of [
            ["patch", (id) => patchCard(workspace, id, { status: "done" })],
            [
                "release",
                (id) =>
                    releaseCard(workspace, id, {
                        status: "done",
                        actor: "tester"
                    })
            ]
        ] as const) {
            const id = await unproven(`Closed through ${door}`);
            await assert.rejects(attempt.bind(null, id), (error: any) => {
                assert.equal(error.code, "CARD_ACCEPTANCE_UNMET");
                assert.equal(error.details.unchecked.length, 3);
                return true;
            });
        }

        // Forced, the write goes through and the trail records it — the point
        // being that a status change is a protocol event whichever door it
        // came through.
        const forced = await unproven("Forced through patch");
        const result = await patchCard(
            workspace,
            forced,
            { status: "done" },
            {
                force: true,
                actor: "tester",
                reason: "Shipped and observed; the checklist is stale",
                now: "2026-08-01T10:00:00.000Z"
            }
        );
        assert.equal(result.card.status, "done");
        assert.match(
            result.card.body,
            /- 2026-08-01 10:00Z tester · backlog → done \(forced past 3 unproven criteria: Shipped and observed; the checklist is stale\)/
        );

        // A patch that does not touch the status is not a transition and must
        // not invent a trail line.
        const quiet = await patchCard(
            workspace,
            forced,
            { priority: "high" },
            { actor: "tester" }
        );
        assert.equal(
            (quiet.card.body.match(/ · /g) || []).length,
            1,
            "only the status change is a protocol event"
        );

        // And a card whose criteria are all met closes through patch like any
        // other door.
        const proven = await unproven("Proven through patch");
        await setCardAcceptance(workspace, proven, { check: [1, 3, 4] });
        const closed = await patchCard(workspace, proven, { status: "done" });
        assert.equal(closed.card.status, "done");
    } finally {
        await cleanup();
    }
});

/**
 * T-0184: a forced move used to leave the same line as a proven one.
 *
 * `force` reached the gate, skipped it and was never written down, so
 * `review → done` meant either "the criteria were proven" or "somebody decided
 * they did not apply" and the record could not say which. Every count anyone
 * would take over closed cards — per actor, per area, and the per-model one
 * ADR-0016 wants — counted both alike.
 */
test("a forced move says so, names the gate, and carries the reason", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-forced-"
    });
    try {
        const unproven = async (title) => {
            const { id } = await createCard(workspace, { title, area: "api" });
            await patchCardBody(workspace, id, { body: BODY });
            return id;
        };
        const lastEntry = (body) =>
            body
                .split("\n")
                .filter((line) => / · /.test(line))
                .at(-1);

        // Door one: transition. The unforced line first, kept as the baseline
        // the forced ones must not have changed.
        const proven = await unproven("Proven");
        await setCardAcceptance(workspace, proven, { check: [1, 3, 4] });
        const clean = await transitionCard(workspace, proven, "done", {
            actor: "tester",
            now: "2026-08-01T10:00:00.000Z"
        });
        assert.equal(
            lastEntry(clean.card.body),
            "- 2026-08-01 10:00Z tester · backlog → done",
            "an ordinary transition's entry is what it always was"
        );

        // Passing `force` where no gate refuses waives nothing, so it records
        // nothing and owes no reason. This is the shape `card reap` uses.
        const idle = await unproven("Forced past nothing");
        const moved = await transitionCard(workspace, idle, "review", {
            actor: "tester",
            force: true,
            now: "2026-08-01T10:00:00.000Z"
        });
        assert.equal(
            lastEntry(moved.card.body),
            "- 2026-08-01 10:00Z tester · backlog → review",
            "a marker has to mean a gate was skipped, or it means nothing"
        );

        const forcedMove = await transitionCard(workspace, idle, "done", {
            actor: "tester",
            force: true,
            reason: "Two of these need a device the CI runner does not have",
            now: "2026-08-01T11:00:00.000Z"
        });
        assert.equal(
            lastEntry(forcedMove.card.body),
            "- 2026-08-01 11:00Z tester · review → done (forced past 3 unproven " +
                "criteria: Two of these need a device the CI runner does not have)"
        );

        // Door two: patch, taking another actor's claim over at the same time.
        // Two gates, two milestones, and each says what was forced about it.
        const patched = await unproven("Patched over a claim");
        await claimCard(workspace, patched, { actor: "someone-else" });
        const forcedPatch = await patchCard(
            workspace,
            patched,
            { status: "done", claimed_by: null, claimed_at: null },
            {
                actor: "tester",
                force: true,
                reason: "They went offline mid-review",
                now: "2026-08-01T12:00:00.000Z"
            }
        );
        const lines = forcedPatch.card.body
            .split("\n")
            .filter((line) => / · /.test(line));
        assert.deepEqual(lines.slice(-2), [
            "- 2026-08-01 12:00Z tester · doing → done (forced past 3 unproven " +
                "criteria: They went offline mid-review)",
            "- 2026-08-01 12:00Z tester · released (forced past someone-else's " +
                "claim: They went offline mid-review)"
        ]);

        // Door three: `release --status done`, where one line carries both.
        const released = await unproven("Released to done");
        await claimCard(workspace, released, { actor: "someone-else" });
        const forcedRelease = await releaseCard(workspace, released, {
            status: "done",
            actor: "tester",
            force: true,
            reason: "Closing out an abandoned branch"
        });
        assert.match(
            lastEntry(forcedRelease.card.body),
            /· released \(forced past 3 unproven criteria and someone-else's claim: Closing out an abandoned branch\)/
        );

        // The reason is demanded by the gate, not by the surface — so no door
        // can reach a forced close without one.
        const silent = await unproven("Forced in silence");
        for (const attempt of [
            () =>
                transitionCard(workspace, silent, "done", {
                    actor: "tester",
                    force: true
                }),
            () =>
                patchCard(
                    workspace,
                    silent,
                    { status: "done" },
                    { actor: "tester", force: true }
                ),
            () =>
                releaseCard(workspace, silent, {
                    status: "done",
                    actor: "tester",
                    force: true
                })
        ]) {
            await assert.rejects(attempt, (error: any) => {
                assert.equal(error.code, "CARD_FORCE_REASON_REQUIRED");
                return true;
            });
        }

        // A reason written across several lines is still one trail entry: the
        // trail is line-oriented, and a second line is one `doctor --fix` reads
        // as a stray entry.
        const wrapped = await unproven("Reason over two lines");
        const written = await transitionCard(workspace, wrapped, "done", {
            actor: "tester",
            force: true,
            reason: "  The demo box\n   has no camera  ",
            now: "2026-08-01T13:00:00.000Z"
        });
        assert.equal(
            lastEntry(written.card.body),
            "- 2026-08-01 13:00Z tester · backlog → done (forced past 3 " +
                "unproven criteria: The demo box has no camera)"
        );
        assert.equal(
            written.card.body.split("\n").filter((line) => / · /.test(line)).length,
            1
        );
    } finally {
        await cleanup();
    }
});

test("a forced close records its reason over HTTP and over MCP too", async () => {
    await withServer(async ({ workspace, url }) => {
        const unproven = async (title) => {
            const { id } = await createCard(workspace, { title, area: "api" });
            await patchCardBody(workspace, id, { body: BODY });
            return id;
        };

        // The HTTP transition route. Refused without a reason, recorded with
        // one — the same rule the CLI meets, because both call one gate.
        const overWire = await unproven("Closed over HTTP");
        const refused = await fetch(`${url}/api/v2/cards/${overWire}/transition`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: "done", force: true })
        });
        assert.equal(refused.status, 400);
        assert.match(
            JSON.stringify(await refused.json()),
            /CARD_FORCE_REASON_REQUIRED/
        );

        const accepted = await fetch(`${url}/api/v2/cards/${overWire}/transition`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                status: "done",
                force: true,
                actor: "tester",
                reason: "Verified on the staging box by hand"
            })
        });
        assert.equal(accepted.status, 200);
        const { cards: afterHttp } = await loadCards(workspace);
        assert.match(
            afterHttp.find((entry) => entry.id === overWire).body,
            /· backlog → done \(forced past 3 unproven criteria: Verified on the staging box by hand\)/
        );

        // The flat PATCH shape carries `force` and `reason` about the write
        // rather than as fields of it, which the route used to hand straight to
        // the field sanitizer.
        const patched = await unproven("Patched over HTTP");
        const response = await fetch(`${url}/api/v2/cards/${patched}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                status: "done",
                force: true,
                actor: "tester",
                reason: "Superseded by the rewrite"
            })
        });
        assert.equal(response.status, 200);
        const { cards: afterPatch } = await loadCards(workspace);
        assert.match(
            afterPatch.find((entry) => entry.id === patched).body,
            /· backlog → done \(forced past 3 unproven criteria: Superseded by the rewrite\)/
        );

        // And MCP, whose release tool has advertised `reason` — "Recorded on
        // the card" — since it was written, and passed it to a signature that
        // did not take it.
        const server = createMcpProtocolServer(workspace, { version: "0.0.0" });
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

        const held = await unproven("Released over MCP");
        await claimCard(workspace, held, { actor: "someone-else" });
        const called = await server.handle({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
                name: "project_card_release",
                arguments: {
                    id: held,
                    actor: "tester",
                    force: true,
                    reason: "Their session ended without releasing it"
                }
            }
        });
        assert.ok("result" in called, JSON.stringify(called));
        const { cards: afterMcp } = await loadCards(workspace);
        assert.match(
            afterMcp.find((entry) => entry.id === held).body,
            /· released \(forced past someone-else's claim: Their session ended without releasing it\)/
        );
    }, { prefix: "workfile-forced-wire-" });
});

test("the gate holds over HTTP and over MCP, not only in process", async () => {
    await withServer(async ({ workspace, url }) => {
        const { id } = await createCard(workspace, {
            title: "Closed from the wire",
            area: "api"
        });
        await patchCardBody(workspace, id, { body: BODY });

        for (const path of [`/api/v2/cards/${id}`, `/api/tasks/${id}`]) {
            const response = await fetch(`${url}${path}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ status: "done" })
            });
            const payload = (await response.json()) as {
                error: { code: string };
            };
            assert.equal(
                response.status,
                409,
                `${path} let an unproven card through`
            );
            assert.equal(payload.error.code, "CARD_ACCEPTANCE_UNMET");
        }

        const server = createMcpProtocolServer(workspace, { version: "0.0.0" });
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
        await server.handle({
            jsonrpc: "2.0",
            method: "notifications/initialized"
        });
        const called = await server.handle({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
                name: "project_card_patch",
                arguments: { id, changes: { status: "done" } }
            }
        });
        assert.match(
            JSON.stringify("result" in called ? called.result : called.error),
            /CARD_ACCEPTANCE_UNMET/
        );
    }, { prefix: "workfile-ac-wire-" });
});

// A card about card bodies quotes one, and the quote had criteria in it. That
// is how T-0157 came to report "0 of 1 met" against a criterion inside a code
// fence while its five real ones went uncounted — and `parseAcceptance` is
// what `assertAcceptanceMet` gates `done` on.
test("criteria inside a fenced block are a quote, not the card's own", () => {
    const body = [
        "## Reproduced",
        "",
        "```text",
        "## Acceptance criteria",
        "",
        "- [ ] quoted criterion",
        "```",
        "",
        "## Acceptance criteria",
        "",
        "- [ ] the real one",
        "- [x] the other real one"
    ].join("\n");

    const reading = parseAcceptance(body);
    assert.equal(reading.items.length, 2);
    assert.deepEqual(
        reading.items.map((item) => item.text),
        ["the real one", "the other real one"]
    );
    assert.equal(reading.unchecked.length, 1);

    // And a write addresses the real list, leaving the quote byte for byte.
    const applied = applyAcceptance(body, { check: [1] });
    assert.match(applied.body, /- \[x\] the real one/);
    assert.match(applied.body, /- \[ \] quoted criterion/);
});

// The reader used to answer "declares no acceptance criteria" for every
// heading but one, and `done` had nothing to hold. T-0026 through T-0029 of
// this repository were closed that way, under `## Acceptance`, with four
// unproven criteria between them; DOC-0005 reported the same hole reached
// through `## Criterio de aceptación`. Both are the same defect, and neither is
// about the phrase that was missing.
test("the headings people actually write open the region", () => {
    const items = ["", "- [ ] one", "- [x] two"];
    for (const heading of [
        "## Acceptance criteria",
        "## Acceptance",
        "### acceptance CRITERIA",
        "## Definition of done",
        "## Success criteria",
        "## Exit criteria",
        "## Acceptance criteria (revised)"
    ]) {
        const reading = parseAcceptance([heading, ...items].join("\n"));
        assert.equal(reading.present, true, heading);
        assert.equal(reading.items.length, 2, heading);
        assert.equal(reading.unchecked.length, 1, heading);
        // A card that declares its region has no orphans to answer for, even
        // when its body carries other lists.
        assert.deepEqual(unreadableCriteria(reading), [], heading);
    }
});

test("a checklist under no recognised heading is reported, not read as empty", () => {
    const body = [
        "## Criterio de aceptación",
        "",
        "- [ ] El bucle corre a 60 Hz",
        "- [x] Ya probado",
        "",
        "## Notes",
        "",
        "- [ ] A note is prose, and its boxes are not criteria"
    ].join("\n");

    const reading = parseAcceptance(body);
    assert.equal(reading.present, false);
    assert.equal(reading.items.length, 0);

    // The unchecked one is the finding. The checked one proves nothing is
    // outstanding, and `## Notes` is excluded outright.
    const unreadable = unreadableCriteria(reading);
    assert.equal(unreadable.length, 1);
    assert.equal(unreadable[0].text, "El bucle corre a 60 Hz");
    assert.equal(
        reading.orphans.some((item) => item.text.startsWith("A note is prose")),
        false
    );

    // A body with no boxes at all is still a card that declares nothing, and
    // must not be dressed up as a finding.
    assert.deepEqual(unreadableCriteria(parseAcceptance("Just prose.")), []);

    // Nor does a quote count, for the same reason the region cannot open in one.
    const quoted = ["```text", "## Whatever", "- [ ] quoted", "```"].join("\n");
    assert.deepEqual(unreadableCriteria(parseAcceptance(quoted)), []);
});

test("done refuses a card whose criteria it cannot read, and force gets through", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-ac-unreadable-"));
    try {
        await cp(fixture, root, { recursive: true });
        const workspace = await loadWorkspace({ root });
        const body = [
            "## Acceptancia",
            "",
            "- [ ] The thing nobody could see",
            "- [ ] The other one"
        ].join("\n");

        const created = await createCard(workspace, {
            title: "Closed on nothing",
            area: "api"
        });
        await patchCardBody(workspace, created.id, { body });

        await assert.rejects(
            () => transitionCard(workspace, created.id, "done", { actor: "tester" }),
            (error: any) => {
                assert.equal(error.code, "CARD_ACCEPTANCE_UNREADABLE");
                assert.equal(error.details.unreadable.length, 2);
                assert.match(error.message, /The thing nobody could see/);
                // The message has to say what to do about it, because the
                // author's next move is to rename a heading.
                assert.match(error.message, /## Acceptance criteria/);
                return true;
            }
        );

        // Renaming the heading is the fix, and it leaves the card gated on its
        // criteria rather than on their invisibility.
        await patchCardBody(workspace, created.id, {
            body: body.replace("## Acceptancia", "## Acceptance criteria")
        });
        await assert.rejects(
            () => transitionCard(workspace, created.id, "done", { actor: "tester" }),
            (error: any) => error.code === "CARD_ACCEPTANCE_UNMET"
        );

        // And the escape hatch, for a checklist that was never a criterion —
        // which now has to say so, and says which gate it walked past.
        const second = await createCard(workspace, { title: "Not criteria", area: "api" });
        await patchCardBody(workspace, second.id, { body });
        const forced = await transitionCard(workspace, second.id, "done", {
            actor: "tester",
            force: true,
            reason: "That list is a packing list, not criteria"
        });
        assert.equal(forced.card.status, "done");
        assert.match(
            forced.card.body,
            /· backlog → done \(forced past 2 unreadable checklist items: That list is a packing list, not criteria\)/
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
