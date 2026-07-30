import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    createIntegrationRegistry,
    createMcpProtocolServer,
    createSemanticSearchProvider,
    defineProjectIntegration,
    loadWorkspace,
    MCP_PROTOCOL_VERSION
} from "../dist/src/index.js";

const fixture = resolve(
    fileURLToPath(new URL("./fixtures/workspace", import.meta.url))
);

test("integration registry supplies semantic search and health adapters explicitly", async () => {
    const provider = createSemanticSearchProvider({
        id: "integration-search",
        async search() {
            return [{ id: "T-0002", score: 1 }];
        }
    });
    const registry = createIntegrationRegistry([
        defineProjectIntegration({
            id: "example.integration",
            title: "Example integration",
            semanticSearchProvider: provider,
            async healthCheck() {
                return [
                    {
                        severity: "info",
                        code: "integration-ready",
                        message: "Example integration is ready."
                    }
                ];
            }
        })
    ]);
    assert.equal(registry.list()[0].capabilities.semanticSearch, true);
    assert.equal(registry.semanticSearchProvider().id, "integration-search");

    const workspace = await loadWorkspace({ root: fixture });
    const server = createMcpProtocolServer(workspace, {
        integrationRegistry: registry
    });
    await server.handle({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "integration-test", version: "1" }
        }
    });
    const search = await server.handle({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
            name: "project_search",
            arguments: { query: "semantic-only-query", mode: "hybrid" }
        }
    });
    assert.equal(search.result.structuredContent.provider, "integration-search");
    assert.equal(search.result.structuredContent.records[0].id, "T-0002");

    const doctor = await server.handle({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "project_doctor", arguments: {} }
    });
    assert.ok(
        doctor.result.structuredContent.issues.some(
            (issue) => issue.code === "integration-ready"
        )
    );
});
