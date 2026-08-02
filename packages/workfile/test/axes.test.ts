import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
    CARD_LIST_KEYS,
    CARD_PATCHABLE_FIELDS,
    CARD_REQUIRED_KEYS,
    CARD_RESERVED_KEYS,
    createCard,
    createMcpProtocolServer,
    defineProject,
    loadCards,
    loadWorkspace,
    patchCard,
    startProjectServer
} from "../dist/src/index.js";
import { card, createTestWorkspace } from "./support/workspace.ts";

const execute = promisify(execFile);
const cli = resolve(fileURLToPath(new URL("../dist/bin/workfile.js", import.meta.url)));

/**
 * A workspace whose config declares one or more axes.
 *
 * The fixture declares none — deliberately, since every other suite asserts
 * against it — so an axis test has to rewrite the config and reload. Reloading
 * is the point: `cards.axes` is read through `workspace.config`, and a test
 * that mutated the object in memory would prove nothing about the file the CLI
 * and the MCP server actually parse.
 */
async function workspaceWithAxes(axes) {
    const created = await createTestWorkspace({ prefix: "workfile-axes-" });
    const path = join(created.root, "project.config.mjs");
    const source = await readFile(path, "utf8");
    await writeFile(
        path,
        source.replace(
            /cards: \{/,
            `cards: {\n        axes: ${JSON.stringify(axes)},`
        )
    );
    return { ...created, workspace: await loadWorkspace({ root: created.root }) };
}

/** `doctor --json`'s report, whether it exited 0 or 1 on the errors it found. */
async function doctorJson(root) {
    try {
        const { stdout } = await execute(
            process.execPath,
            [cli, "doctor", "--json", "--root", root],
            { encoding: "utf8" }
        );
        return stdout;
    } catch (error) {
        const failed = error as { stdout?: string; stderr?: string };
        assert.ok(failed.stdout, `doctor produced no report: ${failed.stderr}`);
        return failed.stdout;
    }
}

/** Re-reads one card from disk, so an assertion sees the file and not a return value. */
async function readCard(workspace, id) {
    const loaded = await loadCards(workspace);
    return loaded.cards.find((card) => card.id === id);
}

function project(cards) {
    return defineProject({
        schemaVersion: 2,
        name: "Axes",
        cards: { areas: ["api"], ...cards }
    });
}

function configCode(cards) {
    try {
        project(cards);
        return null;
    } catch (error) {
        return (error as { code?: string }).code ?? null;
    }
}

test("cards.axes declares a vocabulary, and refuses declarations that buy nothing", () => {
    assert.deepEqual(project({}).cards.axes, {});
    assert.deepEqual(
        project({ axes: { context: ["treasury", "billing"] } }).cards.axes,
        { context: ["treasury", "billing"] }
    );

    // An empty vocabulary validates everything, which is the state an axis is
    // declared to leave. A reserved name puts a project vocabulary on top of a
    // protocol field. Both are config errors rather than surprises at the
    // write path, where the caller who hits them is not the one who wrote the
    // declaration.
    assert.equal(configCode({ axes: { context: [] } }), "CONFIG_LIST_EMPTY");
    assert.equal(
        configCode({ axes: { status: ["open"] } }),
        "CONFIG_CARDS_AXIS_RESERVED"
    );
    assert.equal(
        configCode({ axes: { scope: ["api"] } }),
        "CONFIG_CARDS_AXIS_RESERVED"
    );
    assert.equal(
        configCode({ axes: { "Bounded Context": ["a"] } }),
        "CONFIG_CARDS_AXIS_NAME_INVALID"
    );
    assert.equal(configCode({ axes: ["context"] }), "CONFIG_CARDS_AXES_INVALID");
    assert.equal(
        configCode({ axes: { context: ["a", "a"] } }),
        "CONFIG_LIST_VALUE_DUPLICATE"
    );
});

test("every field a card owns is reserved against being declared an axis", () => {
    // The list config validation reads lives in `config/defaults.ts`, because
    // it runs before any module loads — so it is the same fact in two places,
    // which is the shape that rots. A field added to a card and not added here
    // would become declarable as an axis, and the write path would then
    // validate it twice against two different vocabularies.
    const owned = new Set([
        ...CARD_REQUIRED_KEYS,
        ...CARD_LIST_KEYS,
        ...CARD_PATCHABLE_FIELDS,
        // Injected by `parseCard` rather than stored, and just as unusable.
        "archived",
        "body",
        "file",
        "revision"
    ]);
    const reserved: readonly string[] = CARD_RESERVED_KEYS;
    const missing = [...owned].filter((key) => !reserved.includes(key));
    assert.deepEqual(missing, [], `not reserved: ${missing.join(", ")}`);
    assert.deepEqual(CARD_RESERVED_KEYS, [...CARD_RESERVED_KEYS].sort());
});

test("a declared axis is written, validated and cleared like any card field", async () => {
    const { workspace, cleanup } = await workspaceWithAxes({
        context: ["treasury", "verifactu", "billing"]
    });
    try {
        const created = await createCard(workspace, {
            title: "Reconcile the treasury ledger",
            axes: { context: "treasury" }
        });
        assert.equal(created.card.context, "treasury");

        // Flat, and next to `area` — ADR-0008 is explicit that an axis is a
        // frontmatter key and not a nested mapping, because that is what keeps
        // it greppable and what `search "context:treasury"` already reads.
        const raw = await readFile(created.path, "utf8");
        assert.match(raw, /^area: api\ncontext: treasury$/m);

        await patchCard(workspace, created.id, { axes: { context: "billing" } });
        assert.equal((await readCard(workspace, created.id)).context, "billing");

        // An empty value clears it, the way it clears any other field.
        await patchCard(workspace, created.id, { axes: { context: "" } });
        assert.equal("context" in (await readCard(workspace, created.id)), false);
    } finally {
        await cleanup();
    }
});

test("a value outside the vocabulary and an undeclared axis fail differently", async () => {
    const { workspace, cleanup } = await workspaceWithAxes({
        context: ["treasury", "billing"]
    });
    try {
        await assert.rejects(
            createCard(workspace, {
                title: "Typo",
                axes: { context: "tresury" }
            }),
            (error: any) => {
                // The remedy is "fix the card or declare the value", and the
                // message has to carry the vocabulary for either to be
                // actionable without opening the config.
                assert.equal(error.code, "CARD_AXIS_VALUE_INVALID");
                assert.match(error.message, /treasury, billing/);
                assert.equal(error.details.field, "context");
                return true;
            }
        );
        await assert.rejects(
            createCard(workspace, { title: "Unknown", axes: { layer: "api" } }),
            (error: any) => {
                // A different remedy — declare the axis — hence a different
                // code. Writing it flat instead would have produced a legal
                // frontmatter key that matches nothing, which is exactly the
                // tags failure mode ADR-0008 rejected.
                assert.equal(error.code, "CARD_AXIS_UNKNOWN");
                assert.deepEqual(error.details.axes, ["layer"]);
                return true;
            }
        );
    } finally {
        await cleanup();
    }
});

test("a project that declares no axis cannot write one", async () => {
    const { workspace, cleanup } = await createTestWorkspace({
        prefix: "workfile-noaxes-"
    });
    try {
        await assert.rejects(
            createCard(workspace, { title: "None", axes: { context: "x" } }),
            (error: any) => {
                assert.equal(error.code, "CARD_AXIS_UNKNOWN");
                assert.match(error.message, /declares none/);
                return true;
            }
        );
    } finally {
        await cleanup();
    }
});

test("schema reports the declared axes, so an agent can discover them", async () => {
    const { workspace, root, cleanup } = await workspaceWithAxes({
        context: ["treasury", "billing"]
    });
    try {
        assert.deepEqual(workspace.schema.cards.axes, {
            context: ["treasury", "billing"]
        });
        const { stdout } = await execute(
            process.execPath,
            [cli, "schema", "--json", "--root", root],
            { encoding: "utf8" }
        );
        assert.deepEqual(JSON.parse(stdout).cards.axes, {
            context: ["treasury", "billing"]
        });
    } finally {
        await cleanup();
    }
});

test("--axis round-trips through create and patch, repeated once per axis", async () => {
    const { root, cleanup } = await workspaceWithAxes({
        context: ["treasury", "billing"],
        layer: ["api", "web"]
    });
    const run = (args: string[]) =>
        execute(process.execPath, [cli, ...args, "--root", root], {
            encoding: "utf8"
        });
    try {
        // Repeated, because `COMMAND_FLAGS` is static and axes are per project
        // — a flag per axis is not available, which is the whole reason the
        // name travels in the value.
        const created = JSON.parse(
            (
                await run([
                    "card",
                    "create",
                    "--json",
                    "--title",
                    "Two axes",
                    "--axis",
                    "context=treasury",
                    "--axis",
                    "layer=api"
                ])
            ).stdout
        );
        assert.equal(created.context, "treasury");
        assert.equal(created.layer, "api");

        const patched = JSON.parse(
            (await run(["card", "patch", created.id, "--json", "--axis", "context=billing"]))
                .stdout
        );
        assert.equal(patched.context, "billing");
        assert.equal(patched.layer, "api", "one axis must not clear another");

        // `search "context:billing"` was already the retrieval half before any
        // of this existed; the point of declaring is that the value it filters
        // on is now one the project can be held to.
        const found = JSON.parse(
            (await run(["search", "context:billing", "--json"])).stdout
        );
        assert.deepEqual(
            found.records.map((record) => record.id),
            [created.id]
        );
    } finally {
        await cleanup();
    }
});

test("--axis without a name=value pair is refused rather than dropped", async () => {
    const { root, cleanup } = await workspaceWithAxes({ context: ["treasury"] });
    try {
        await assert.rejects(
            execute(
                process.execPath,
                [cli, "card", "patch", "T-0001", "--axis", "context", "--root", root],
                { encoding: "utf8" }
            ),
            (error: any) => {
                assert.match(error.stderr, /CLI_ARGUMENT_INVALID/);
                return true;
            }
        );
        // `card patch` used to require --json-input; --axis is now the other
        // way to name a change, and neither being present still fails.
        await assert.rejects(
            execute(process.execPath, [cli, "card", "patch", "T-0001", "--root", root], {
                encoding: "utf8"
            }),
            (error: any) => {
                assert.match(error.stderr, /CLI_ARGUMENT_REQUIRED/);
                assert.match(error.stderr, /--axis name=value/);
                return true;
            }
        );
    } finally {
        await cleanup();
    }
});

/**
 * One JSON-RPC round trip, narrowed to its result.
 *
 * `handle` returns a response that is either a result or an error, and reading
 * `.result` off the union is what a caller does when it has already decided
 * which one it got. Asserting the shape first is the same check, made where it
 * can still say something useful — an unexpected protocol error surfaces here
 * instead of as `undefined` three assertions later.
 */
async function rpc(server, id, method, params = {}) {
    const response = await server.handle({ jsonrpc: "2.0", id, method, params });
    assert.ok("result" in response, `${method} answered with an error`);
    return response.result;
}

test("the MCP tools accept axes on create and on patch", async () => {
    const { workspace, cleanup } = await workspaceWithAxes({
        context: ["treasury", "billing"]
    });
    try {
        const server = createMcpProtocolServer(workspace, { version: "0.0.0" });
        await rpc(server, 1, "initialize", {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "axes-test", version: "1.0.0" }
        });
        await server.handle({
            jsonrpc: "2.0",
            method: "notifications/initialized"
        });

        // The create tool's schema is closed (`additionalProperties: false`)
        // and static, so without a declared `axes` property an axis would be
        // rejected at the protocol boundary before any of this code ran.
        const tools = await rpc(server, 2, "tools/list");
        const create = tools.tools.find(
            (tool) => tool.name === "project_card_create"
        );
        assert.equal(create.inputSchema.properties.axes.type, "object");

        const created = await rpc(server, 3, "tools/call", {
            name: "project_card_create",
            arguments: {
                title: "Through MCP",
                area: "api",
                axes: { context: "treasury" }
            }
        });
        assert.equal(created.isError, undefined);
        const id = created.structuredContent.record.id;

        const patched = await rpc(server, 4, "tools/call", {
            name: "project_card_patch",
            arguments: { id, changes: { axes: { context: "billing" } } }
        });
        assert.equal(patched.isError, undefined);
        assert.equal((await readCard(workspace, id)).context, "billing");

        const rejected = await rpc(server, 5, "tools/call", {
            name: "project_card_patch",
            arguments: { id, changes: { axes: { context: "nope" } } }
        });
        assert.equal(rejected.isError, true);
        assert.match(JSON.stringify(rejected), /CARD_AXIS_VALUE_INVALID/);
    } finally {
        await cleanup();
    }
});

test("the HTTP routes carry axes too, and refuse the same values", async () => {
    // The fourth surface. Three of four have been the leaky ratio here before
    // — `card patch` enforcing a gate the HTTP and MCP routes walked past — so
    // this asserts the pass-through rather than trusting that these routes hand
    // the body straight to `createCard`.
    const { workspace, cleanup } = await workspaceWithAxes({
        context: ["treasury", "billing"]
    });
    const server = await startProjectServer(workspace, { port: 0 });
    const post = async (path, body, method = "POST") => {
        const response = await fetch(`${server.url}${path}`, {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body)
        });
        // Read once: `await response.text()` inside an assertion message
        // consumes the body the assertion is about to parse.
        const text = await response.text();
        return { status: response.status, body: JSON.parse(text) };
    };
    try {
        const created = await post("/api/v2/cards", {
            title: "Through HTTP",
            area: "api",
            axes: { context: "treasury" }
        });
        assert.equal(created.status, 201, JSON.stringify(created.body));
        const id = created.body.record.id;
        assert.equal((await readCard(workspace, id)).context, "treasury");

        const patched = await post(
            `/api/v2/cards/${id}`,
            { changes: { axes: { context: "billing" } } },
            "PATCH"
        );
        assert.equal(patched.status, 200, JSON.stringify(patched.body));
        assert.equal((await readCard(workspace, id)).context, "billing");

        const rejected = await post(
            `/api/v2/cards/${id}`,
            { changes: { axes: { context: "nope" } } },
            "PATCH"
        );
        assert.equal(rejected.status, 400);
        assert.equal(rejected.body.error.code, "CARD_AXIS_VALUE_INVALID");
    } finally {
        await server.close();
        await cleanup();
    }
});

test("doctor errors on a value outside the vocabulary and warns on a missing one", async () => {
    const { root, cleanup } = await workspaceWithAxes({
        context: ["treasury", "billing"]
    });
    try {
        // Written by hand, which is the case that matters: write-time
        // validation only ever sees cards written after the axis was declared,
        // and the repository this was designed for has a hundred that were not.
        await writeFile(
            join(root, ".project/cards/T-9001-typo.md"),
            card("T-9001", { context: "tresury" })
        );
        await writeFile(
            join(root, ".project/cards/T-9002-absent.md"),
            card("T-9002")
        );
        await writeFile(
            join(root, ".project/cards/T-9003-closed.md"),
            card("T-9003", { status: "done" })
        );

        // Through the binary rather than `diagnoseCards` directly: doctor reads
        // the project index, not the card loader, and a rule that works on one
        // and not the other is a rule that does nothing where it is used.
        // `doctor` exits 1 on any error, which is the case under test, so the
        // report has to be read off the rejection rather than the resolution.
        const report = JSON.parse(await doctorJson(root));
        const found = (code) =>
            report.issues.filter((entry) => entry.code === code);

        const invalid = found("invalid-axis");
        assert.equal(invalid.length, 1);
        assert.equal(invalid[0].severity, "error");
        assert.equal(invalid[0].id, "T-9001");
        assert.match(invalid[0].message, /treasury, billing/);

        const missing = found("missing-axis");
        assert.equal(missing[0].severity, "warning");
        // T-0001 (fixture, backlog) and T-9002 (written above, backlog) are the
        // only cards that are both open and unclassified. The three exclusions
        // are each a different reason, and all three matter:
        //
        //   T-9001  has a value — a wrong one, reported as the error above
        //   T-9003  done, and nobody classifies finished work retroactively
        //   T-0002  archived, for the same reason
        //
        // Closed work being exempt is the point. Declaring an axis must not
        // turn a repository red, and a warning per finished card floods just as
        // badly in yellow: this repository would have emitted a hundred. Doctor
        // output nobody can act on is output nobody reads.
        assert.deepEqual(
            missing.map((entry) => entry.id).sort(),
            ["T-0001", "T-9002"],
            "open and unclassified, and only those"
        );
    } finally {
        await cleanup();
    }
});

test("card list --axis filters, combines and refuses a repeated axis", async () => {
    const { root, cleanup } = await workspaceWithAxes({
        context: ["treasury", "billing"],
        layer: ["api", "web"]
    });
    const run = (args: string[]) =>
        execute(process.execPath, [cli, ...args, "--root", root], {
            encoding: "utf8"
        });
    const ids = async (args: string[]) =>
        JSON.parse((await run([...args, "--json"])).stdout).records.map(
            (record) => record.id
        );
    try {
        const a = JSON.parse(
            (
                await run([
                    "card", "create", "--json", "--title", "Treasury api",
                    "--axis", "context=treasury", "--axis", "layer=api"
                ])
            ).stdout
        );
        const b = JSON.parse(
            (
                await run([
                    "card", "create", "--json", "--title", "Billing web",
                    "--axis", "context=billing", "--axis", "layer=web"
                ])
            ).stdout
        );

        assert.deepEqual(await ids(["card", "list", "--axis", "context=treasury"]), [a.id]);
        // A comma list is an OR within one axis, exactly like --status and
        // --area, so the flag reads the same way everywhere.
        assert.deepEqual(
            (await ids(["card", "list", "--axis", "context=treasury,billing"])).sort(),
            [a.id, b.id].sort()
        );
        // A second --axis is an AND across axes.
        assert.deepEqual(
            await ids(["card", "list", "--axis", "context=billing", "--axis", "layer=api"]),
            []
        );
        assert.deepEqual(
            await ids(["card", "list", "--axis", "context=billing", "--axis", "layer=web"]),
            [b.id]
        );
        // And it composes with the filters that were already there.
        assert.deepEqual(
            await ids(["card", "list", "--axis", "layer=web", "--status", "done"]),
            []
        );

        await assert.rejects(
            run(["card", "list", "--axis", "context=treasury", "--axis", "context=billing"]),
            (error: any) => {
                // Repeating one axis keeps one value and drops the other, which
                // the caller cannot detect — the same reason every other flag
                // here refuses to repeat.
                assert.match(error.stderr, /CLI_ARGUMENT_CONFLICT/);
                return true;
            }
        );
    } finally {
        await cleanup();
    }
});
