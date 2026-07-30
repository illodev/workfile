import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    createMcpProtocolServer,
    loadWorkspace,
    MCP_LEGACY_PROTOCOL_VERSION,
    MCP_META_KEYS,
    MCP_PROTOCOL_VERSION,
    mcpClientConfiguration
} from "../dist/src/index.js";

const fixture = resolve(
    fileURLToPath(new URL("./fixtures/workspace", import.meta.url))
);
const mcpBin = resolve(
    fileURLToPath(new URL("../dist/bin/workfile-mcp.js", import.meta.url))
);

function request(id, method, params = {}) {
    return { jsonrpc: "2.0", id, method, params };
}

function modernParams(params = {}, version = MCP_PROTOCOL_VERSION) {
    return {
        ...params,
        _meta: {
            [MCP_META_KEYS.protocolVersion]: version,
            [MCP_META_KEYS.clientInfo]: { name: "test-client", version: "1.0.0" },
            [MCP_META_KEYS.clientCapabilities]: {}
        }
    };
}

async function initialize(server) {
    const response = await server.handle(
        request(1, "initialize", {
            protocolVersion: MCP_LEGACY_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" }
        })
    );
    assert.equal(response.result.protocolVersion, MCP_LEGACY_PROTOCOL_VERSION);
    await server.handle({ jsonrpc: "2.0", method: "notifications/initialized" });
}

test("MCP exposes tools, resources and prompts over the shared project core", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-mcp-"));
    await cp(fixture, root, { recursive: true });
    try {
        const workspace = await loadWorkspace({ root });
        const server = createMcpProtocolServer(workspace, { version: "0.6.0" });
        await initialize(server);

        const tools = await server.handle(request(2, "tools/list"));
        const names = tools.result.tools.map((tool) => tool.name);

        // The whole published tool surface, asserted here in the FAST suite.
        // `package-smoke.mjs` checks it too, but that one only runs from
        // `check:release`, so adding a tool used to go green on the pull
        // request and blow up at publish time — which is exactly what happened
        // when `project_doc_move` landed. This is the same assertion one gate
        // earlier.
        assert.deepEqual(names, [
            "project_agent_context",
            "project_card_archive",
            "project_card_claim",
            "project_card_create",
            "project_card_list",
            "project_card_note",
            "project_card_patch",
            "project_card_release",
            "project_card_reopen",
            "project_card_transition",
            "project_card_write",
            "project_changelog_add",
            "project_changelog_list",
            "project_changelog_patch",
            "project_changelog_preview",
            "project_changelog_release",
            "project_doc_create",
            "project_doc_list",
            "project_doc_move",
            "project_doc_patch",
            "project_doctor",
            "project_get_record",
            "project_memory_add",
            "project_memory_graduate",
            "project_memory_list",
            "project_memory_patch",
            "project_memory_supersede",
            "project_next",
            "project_search",
            "project_workspace"
        ]);
        assert.deepEqual(names, [...names].sort());

        const search = await server.handle(
            request(3, "tools/call", {
                name: "project_search",
                arguments: { query: "example", limit: 5 }
            })
        );
        assert.equal(search.result.isError, undefined);
        assert.equal(search.result.structuredContent.records[0].id, "T-0001");

        const created = await server.handle(
            request(4, "tools/call", {
                name: "project_card_create",
                arguments: {
                    title: "Created through MCP",
                    area: "infra",
                    body: "Integration coverage."
                }
            })
        );
        assert.equal(created.result.structuredContent.record.id, "T-0003");

        const resources = await server.handle(request(5, "resources/list"));
        assert.ok(
            resources.result.resources.some(
                (resource) => resource.uri === "project://record/T-0003"
            )
        );
        const resource = await server.handle(
            request(6, "resources/read", { uri: "project://record/T-0003" })
        );
        assert.match(resource.result.contents[0].text, /Created through MCP/);

        const prompts = await server.handle(request(7, "prompts/list"));
        assert.ok(prompts.result.prompts.some((prompt) => prompt.name === "start-work"));
        const prompt = await server.handle(
            request(8, "prompts/get", {
                name: "start-work",
                arguments: { cardId: "T-0001", actor: "mcp-test" }
            })
        );
        assert.match(prompt.result.messages[0].content.text, /project_card_claim/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("MCP supports modern stateless discovery and legacy initialization", async () => {
    const workspace = await loadWorkspace({ root: fixture });
    const server = createMcpProtocolServer(workspace, { version: "0.6.0" });

    const discovery = await server.handle(
        request(1, "server/discover", modernParams())
    );
    assert.equal(discovery.result.resultType, "complete");
    assert.ok(discovery.result.supportedVersions.includes(MCP_PROTOCOL_VERSION));
    assert.equal(
        discovery.result._meta[MCP_META_KEYS.serverInfo].name,
        "workfile"
    );

    const tools = await server.handle(
        request(2, "tools/list", modernParams())
    );
    assert.equal(tools.result.resultType, "complete");
    assert.equal(tools.result.cacheScope, "private");
    assert.ok(tools.result.ttlMs > 0);

    const unsupported = await server.handle(
        request(3, "tools/list", modernParams({}, "2099-01-01"))
    );
    assert.equal(unsupported.error.code, -32022);
    assert.equal(unsupported.error.data.requested, "2099-01-01");
    assert.ok(unsupported.error.data.supported.includes(MCP_PROTOCOL_VERSION));

    const legacy = createMcpProtocolServer(workspace);
    await initialize(legacy);
    const legacyTools = await legacy.handle(request(2, "tools/list"));
    assert.equal(legacyTools.result.resultType, undefined);
    assert.ok(legacyTools.result.tools.length > 0);
});

test("read-only MCP hides and rejects mutation tools", async () => {
    const workspace = await loadWorkspace({ root: fixture, readOnly: true });
    const server = createMcpProtocolServer(workspace, { readOnly: true });
    await initialize(server);
    const tools = await server.handle(request(2, "tools/list"));
    assert.ok(!tools.result.tools.some((tool) => tool.name === "project_card_create"));
    const mutation = await server.handle(
        request(3, "tools/call", {
            name: "project_card_create",
            arguments: { title: "Should not exist", area: "infra" }
        })
    );
    assert.equal(mutation.result.isError, true);
    assert.equal(
        mutation.result.structuredContent.error.code,
        "MCP_SERVER_READ_ONLY"
    );
});

test("stdio transport emits newline-delimited JSON-RPC and no banner text", async () => {
    const child = spawn(
        process.execPath,
        [mcpBin, "--root", fixture, "--read-only"],
        { stdio: ["pipe", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
        stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
        stderr += chunk;
    });
    child.stdin.write(
        `${JSON.stringify(
            request(1, "server/discover", modernParams())
        )}\n`
    );
    child.stdin.write(
        `${JSON.stringify(request(2, "tools/list", modernParams()))}\n`
    );
    child.stdin.end();
    const exitCode = await new Promise((resolveExit) => child.on("exit", resolveExit));
    assert.equal(exitCode, 0, stderr);
    const messages = stdout.trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(messages.length, 2);
    assert.equal(messages[0].id, 1);
    assert.equal(messages[0].result.resultType, "complete");
    assert.ok(messages[0].result.supportedVersions.includes(MCP_PROTOCOL_VERSION));
    assert.equal(messages[1].id, 2);
    assert.equal(messages[1].result.resultType, "complete");
    assert.ok(messages[1].result.tools.every((tool) => tool.annotations.readOnlyHint));
    assert.equal(stderr, "");
});

test("CLI and HTTP expose MCP discovery without starting the stdio stream", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { startProjectServer } = await import("../dist/src/index.js");
    const execute = promisify(execFile);
    const cli = resolve(
        fileURLToPath(new URL("../dist/bin/workfile.js", import.meta.url))
    );
    const inspected = await execute(
        process.execPath,
        [cli, "mcp", "inspect", "--root", fixture, "--json"],
        { encoding: "utf8" }
    );
    const manifest = JSON.parse(inspected.stdout);
    assert.equal(manifest.transport, "stdio");
    assert.ok(manifest.tools.some((tool) => tool.name === "project_doctor"));

    const configured = await execute(
        process.execPath,
        [cli, "mcp", "config", "--root", fixture, "--read-only", "--json"],
        { encoding: "utf8" }
    );
    const configuration = JSON.parse(configured.stdout);
    assert.equal(configuration.transport, "stdio");
    assert.ok(configuration.args.includes("--read-only"));

    const workspace = await loadWorkspace({ root: fixture });
    const running = await startProjectServer(workspace, { port: 0 });
    try {
        const response = await fetch(`${running.url}/api/v2/mcp`);
        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.protocolVersion, MCP_PROTOCOL_VERSION);
        assert.ok(payload.resources.includes("project://record/{id}"));
    } finally {
        await running.close();
    }
});

// `workfile mcp config` exists so hosts can paste a runnable process into their
// MCP client. It used to emit `workfile mcp --root …`, which the multiplexed
// CLI parsed as an unknown subcommand and rejected with exit 1 — so the very
// first thing anyone did with this package failed. Spawning exactly what the
// helper returns is the only assertion that cannot drift away from reality.
test("the process emitted by mcp config actually answers initialize", async () => {
    const workspace = await loadWorkspace({ root: fixture });
    const configuration = mcpClientConfiguration(workspace);

    assert.equal(configuration.transport, "stdio");
    assert.match(configuration.args[0], /workfile-mcp\.js$/);

    const child = spawn(configuration.command, configuration.args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...configuration.env }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    // Both eras, because a host may speak either: `initialize` is the legacy
    // handshake and negotiates down to it by definition, while `server/discover`
    // is the modern one and should land on the version the config advertises.
    child.stdin.write(
        `${JSON.stringify(
            request(1, "initialize", {
                protocolVersion: MCP_LEGACY_PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: { name: "config-smoke", version: "1.0.0" }
            })
        )}\n`
    );
    child.stdin.write(
        `${JSON.stringify(request(2, "server/discover", modernParams()))}\n`
    );
    child.stdin.end();

    const exitCode = await new Promise((done) => child.on("exit", done));
    assert.equal(exitCode, 0, stderr);
    assert.equal(stderr, "");
    const messages = stdout
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
    assert.equal(messages[0].id, 1);
    assert.equal(
        messages[0].result.protocolVersion,
        MCP_LEGACY_PROTOCOL_VERSION
    );
    assert.equal(messages[1].id, 2);
    assert.ok(
        messages[1].result.supportedVersions.includes(
            configuration.protocolVersion
        )
    );
});

// The five listing tools exist because none of the original twenty-two could
// list anything, and `project_search` refused an empty query — so "what is in
// doing?", the question an agent asks first, was not expressible over MCP at
// all. The only way to answer it was to read the Markdown directly, which is
// the token spend this protocol exists to remove.
test("listing tools answer what is in the workspace without a search query", async () => {
    const root = await mkdtemp(join(tmpdir(), "workfile-listing-"));
    await cp(fixture, root, { recursive: true });
    try {
        const workspace = await loadWorkspace({ root });
        const server = createMcpProtocolServer(workspace, { version: "0.6.0" });
        await initialize(server);

        let id = 100;
        const call = async (name, args = {}) => {
            const response = await server.handle(
                request(++id, "tools/call", { name, arguments: args })
            );
            assert.equal(
                response.result.isError,
                undefined,
                `${name}: ${JSON.stringify(response.result.structuredContent)}`
            );
            return response.result;
        };

        const all = await call("project_card_list");
        assert.ok(all.structuredContent.total > 0);
        assert.equal(
            all.structuredContent.records.length,
            all.structuredContent.total
        );

        // Filters narrow, and they are applied — the CLI equivalent used to
        // accept them and return everything.
        const backlog = await call("project_card_list", { status: ["backlog"] });
        assert.ok(
            backlog.structuredContent.records.every(
                (record) => record.status === "backlog"
            )
        );
        const impossible = await call("project_card_list", {
            status: ["discarded"],
            area: ["nowhere"]
        });
        assert.equal(impossible.structuredContent.total, 0);

        // Listings carry no Markdown body: fifty of them is a listing, not a
        // read, and the body is what `project_get_record` is for.
        for (const record of all.structuredContent.records) {
            assert.equal("body" in record, false);
            assert.equal(typeof record.bodyBytes, "number");
        }

        // `content` is a one-line summary rather than a second copy of the
        // payload, which used to double the cost of every single call.
        assert.match(all.content[0].text, /match/);
        assert.ok(
            all.content[0].text.length < 200,
            "the human-readable line must not restate the payload"
        );

        for (const name of [
            "project_doc_list",
            "project_changelog_list",
            "project_memory_list"
        ]) {
            const result = await call(name);
            assert.equal(typeof result.structuredContent.total, "number");
        }

        // `project_next` answers the actual question: what can I start now.
        const next = await call("project_next", { limit: 3 });
        assert.ok(next.structuredContent.records.length <= 3);
        for (const record of next.structuredContent.records) {
            assert.ok(record.reason, "each candidate explains why it qualifies");
            assert.notEqual(record.recordType, "epic", "epics are not work");
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
