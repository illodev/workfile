import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createTestWorkspace, withServer } from "./support/workspace.ts";

import {
    applyAcceptance,
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
    transitionCard
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
    // declares it empty, and the doctor should not treat them alike.
    assert.deepEqual(parseAcceptance("no section here"), {
        present: false,
        items: [],
        unchecked: []
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
        const forced = await transitionCard(workspace, second.id, "done", {
            actor: "tester",
            force: true
        });
        assert.equal(forced.card.status, "done");
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
            { force: true, actor: "tester", now: "2026-08-01T10:00:00.000Z" }
        );
        assert.equal(result.card.status, "done");
        assert.match(
            result.card.body,
            /- 2026-08-01 10:00Z tester · backlog → done/
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
