import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    createIntegrationRegistry,
    createMcpProtocolServer,
    createSemanticSearchProvider,
    defineProjectIntegration,
    inspectMcpServer,
    loadWorkspace,
    runDoctor,
    startProjectServer,
    MCP_PROTOCOL_VERSION
} from "../dist/src/index.js";

const fixture = resolve(
    fileURLToPath(new URL("./fixtures/workspace", import.meta.url))
);

async function workspaceWithConfig(config) {
    const root = await mkdtemp(join(tmpdir(), "workfile-integrations-"));
    await cp(fixture, root, { recursive: true });
    await writeFile(join(root, "project.config.mjs"), config);
    return root;
}

const DECLARED_INTEGRATIONS_CONFIG = `export default {
    schemaVersion: 2,
    name: "Integrations workspace",
    language: "es",
    cards: { areas: ["api", "web", "infra", "docs"] },
    search: { provider: "preferred-search" }
};

export const integrations = [
    {
        id: "fallback-search",
        semanticSearchProvider: {
            id: "fallback-search",
            async search() {
                return [];
            }
        }
    },
    {
        id: "preferred-search",
        semanticSearchProvider: {
            id: "preferred-search",
            async search({ records }) {
                return records
                    .filter((record) => record.id === "T-0002")
                    .map((record) => ({ id: record.id, score: 1 }));
            }
        }
    }
];
`;

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

test("config-declared integrations reach MCP, HTTP and doctor without wiring", async () => {
    const root = await workspaceWithConfig(DECLARED_INTEGRATIONS_CONFIG);
    try {
        const workspace = await loadWorkspace({ root });
        assert.equal(workspace.integrations.length, 2);
        assert.equal(inspectMcpServer(workspace).semanticSearch, true);

        const server = createMcpProtocolServer(workspace);
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
                arguments: { query: "semantic-only-query" }
            }
        });
        assert.equal(
            search.result.structuredContent.provider,
            "preferred-search"
        );
        assert.equal(search.result.structuredContent.records[0].id, "T-0002");

        const http = await startProjectServer(workspace, { port: 0 });
        try {
            const hybrid = await (
                await fetch(`${http.url}/api/v2/search?q=semantic-only-query`)
            ).json();
            assert.equal(hybrid.mode, "hybrid");
            assert.equal(hybrid.provider, "preferred-search");
            assert.equal(hybrid.records[0].id, "T-0002");

            const lexical = await (
                await fetch(
                    `${http.url}/api/v2/search?q=semantic-only-query&mode=lexical`
                )
            ).json();
            assert.equal(lexical.mode, "lexical");
            assert.equal(lexical.total, 0);

            const records = await (
                await fetch(`${http.url}/api/v2/records?q=semantic-only-query`)
            ).json();
            assert.equal(records.mode, "lexical");
        } finally {
            await http.close();
        }

        const report = await runDoctor(workspace);
        assert.ok(
            !report.issues.some(
                (issue) => issue.code === "search-provider-unresolved"
            )
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("the guarded import the README teaches loads where the package is absent", async () => {
    // Verbatim from packages/search-local/README.md, because the criterion is
    // about the form the README teaches — a paraphrase would test something
    // else. A bare import resolves from the config file, so the config would
    // only load with node_modules present, and the generated CI job runs
    // `npx workfile doctor` on a clean clone. The guard is what makes a
    // missing package mean lexical search rather than a red pipeline.
    //
    // The workspace is a temp directory, so `@illodev/workfile-search-local`
    // genuinely does not resolve from it: ESM resolves against the importing
    // module's URL, which never reaches this repository's node_modules.
    const root = await workspaceWithConfig(`export const integrations = await (async () => {
    try {
        const { localSearchIntegration } = await import(
            "@illodev/workfile-search-local"
        );
        return [localSearchIntegration()];
    } catch {
        return [];
    }
})();

export default {
    schemaVersion: 2,
    name: "Guarded workspace",
    search: { provider: "local-embeddings" }
};
`);
    try {
        const workspace = await loadWorkspace({ root });
        assert.deepEqual(workspace.integrations, []);

        // And the workspace stays usable: a provider nothing satisfies is a
        // doctor issue, not a refusal to load. That is the whole trade the
        // guard makes.
        assert.equal(inspectMcpServer(workspace).semanticSearch, false);
        const report = await runDoctor(workspace);
        assert.ok(
            report.issues.some(
                (issue) => issue.code === "search-provider-unresolved"
            ),
            "the unsatisfied provider went unreported"
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a malformed integrations export fails on load, naming the config", async () => {
    const notArray = await workspaceWithConfig(
        `export default { schemaVersion: 2, name: "Bad" };\nexport const integrations = "nope";\n`
    );
    try {
        await assert.rejects(
            () => loadWorkspace({ root: notArray }),
            (error) => error.code === "CONFIG_INTEGRATIONS_INVALID"
        );
    } finally {
        await rm(notArray, { recursive: true, force: true });
    }

    const badDefinition = await workspaceWithConfig(
        `export default { schemaVersion: 2, name: "Bad" };\nexport const integrations = [{ id: "Bad Id" }];\n`
    );
    try {
        await assert.rejects(
            () => loadWorkspace({ root: badDefinition }),
            (error) => error.code === "INTEGRATION_ID_INVALID"
        );
    } finally {
        await rm(badDefinition, { recursive: true, force: true });
    }
});

/**
 * T-0213: a declared `healthCheck` is a foreign call inside `doctor`.
 *
 * The hook is repository-supplied code, and the config module body that declares
 * it already ran on import — so none of this is containment and ADR-0019 says so.
 * What these pin is narrower and is the part that was broken: a hook cannot speak
 * *for* `doctor`. It cannot take the command down, it cannot hang it forever, and
 * it cannot hand back a value that decides whether the repository passes.
 */
test("a healthCheck that throws becomes a finding, not a dead doctor", async () => {
    const root = await workspaceWithConfig(
        `export default { schemaVersion: 2, name: "Throwing" };
export const integrations = [
    { id: "sync-boom", healthCheck() { throw new Error("exploded on the spot"); } },
    { id: "async-boom", async healthCheck() { throw new Error("exploded later"); } }
];
`
    );
    try {
        const workspace = await loadWorkspace({ root });
        // Before this, the raw error propagated out of runDoctor and took every
        // caller with it: the CLI, /api/v2/health, and the MCP doctor tool.
        const report = await runDoctor(workspace);
        const failures = report.issues.filter(
            (issue) => issue.code === "integration-health-check-failed"
        );
        assert.equal(failures.length, 2);
        for (const failure of failures) {
            assert.equal(failure.severity, "error");
            // Attributed, or the reader cannot tell which of their integrations
            // to go and fix.
            assert.match(failure.message, /^Integration (sync|async)-boom /);
            assert.match(failure.details.error, /exploded (on the spot|later)/);
        }
        // A declared check that could not answer is not a pass.
        assert.equal(report.ok, false);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a healthCheck returning an uncountable diagnostic cannot decide `ok`", async () => {
    const root = await workspaceWithConfig(
        `export default { schemaVersion: 2, name: "Junk" };
export const integrations = [{ id: "junk", healthCheck() { return { issues: [
    { severity: "catastrophe", code: 42 },
    { severity: "warning", code: "well-formed", message: "this one counts" }
] }; } }];
`
    );
    try {
        const workspace = await loadWorkspace({ root });
        const report = await runDoctor(workspace);

        // The failure this replaces: `counts[issue.severity] += 1` on an unknown
        // severity wrote NaN into the counts, the issue landed in no bucket, and
        // `ok` stayed true while the comparator sorted on NaN.
        assert.deepEqual(Object.keys(report.counts).sort(), [
            "error",
            "info",
            "warning"
        ]);
        for (const count of Object.values(report.counts)) {
            assert.equal(Number.isInteger(count), true);
        }
        assert.equal(
            report.issues.some((issue) => issue.severity === "catastrophe"),
            false
        );

        const invalid = report.issues.find(
            (issue) => issue.code === "integration-health-check-invalid"
        );
        assert.equal(invalid.severity, "error");
        assert.match(invalid.message, /1 of 2/);
        assert.equal(invalid.details.integration, "junk");

        // And the well-formed sibling in the same batch still lands: rejecting
        // one entry is not rejecting the integration.
        assert.equal(
            report.issues.some((issue) => issue.code === "well-formed"),
            true
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a healthCheck returning something that is not diagnostics at all is named", async () => {
    const root = await workspaceWithConfig(
        `export default { schemaVersion: 2, name: "Stringy" };
export const integrations = [{ id: "stringy", healthCheck() { return "not diagnostics"; } }];
`
    );
    try {
        const workspace = await loadWorkspace({ root });
        const report = await runDoctor(workspace);
        const invalid = report.issues.find(
            (issue) => issue.code === "integration-health-check-invalid"
        );
        assert.equal(invalid.severity, "error");
        assert.match(invalid.message, /returned string/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a healthCheck with nothing to say is indistinguishable from no hook", async () => {
    const quiet = await workspaceWithConfig(
        `export default { schemaVersion: 2, name: "Quiet", cards: { areas: ["api", "web", "infra", "docs"] } };
export const integrations = [{ id: "quiet", healthCheck() { return null; } }];
`
    );
    const none = await workspaceWithConfig(
        `export default { schemaVersion: 2, name: "Quiet", cards: { areas: ["api", "web", "infra", "docs"] } };
`
    );
    try {
        const withHook = await runDoctor(await loadWorkspace({ root: quiet }));
        const without = await runDoctor(await loadWorkspace({ root: none }));
        assert.deepEqual(withHook.counts, without.counts);
        assert.deepEqual(
            withHook.issues.map((issue) => issue.code),
            without.issues.map((issue) => issue.code)
        );
    } finally {
        await rm(quiet, { recursive: true, force: true });
        await rm(none, { recursive: true, force: true });
    }
});

test("a healthCheck that never settles is bounded, and doctor still answers", async () => {
    // Bounded through the injectable seam so this costs milliseconds; the
    // default is ten seconds and `runDoctor` uses it. Verified once at the real
    // default against the built binary — see the card's note.
    const integrationRegistry = createIntegrationRegistry(
        [
            defineProjectIntegration({
                id: "hang",
                healthCheck() {
                    return new Promise(() => {});
                }
            })
        ],
        { healthCheckTimeoutMs: 25 }
    );
    const workspace = await loadWorkspace({ root: fixture });
    // Through `runDoctor` rather than the registry alone, because the claim is
    // about the command: it returns a report instead of waiting on the hook.
    const report = await runDoctor(workspace, { integrationRegistry });
    const timedOut = report.issues.find(
        (issue) => issue.code === "integration-health-check-timeout"
    );
    assert.equal(timedOut.severity, "error");
    assert.equal(timedOut.details.timeoutMs, 25);
    assert.equal(timedOut.details.integration, "hang");
    assert.equal(report.ok, false);
});

test("declaring no integrations leaves doctor exactly as it was", async () => {
    // The criterion that keeps the rest of this honest: everything above adds
    // machinery to the health path, and the overwhelming majority of workspaces
    // — including this repository — declare no integrations at all. They must
    // not pay for it, and must not see a single issue they did not see before.
    const root = await workspaceWithConfig(
        `export default {
    schemaVersion: 2,
    name: "No integrations",
    cards: { areas: ["api", "web", "infra", "docs"] }
};
`
    );
    try {
        const workspace = await loadWorkspace({ root });
        assert.deepEqual(workspace.integrations, []);
        const report = await runDoctor(workspace);
        assert.equal(
            report.issues.some((issue) =>
                String(issue.code).startsWith("integration-health-check")
            ),
            false
        );
        // No health hook to call means no bounding timer was ever armed, so the
        // report is produced and the process is free to exit immediately.
        assert.deepEqual(Object.keys(report.counts).sort(), [
            "error",
            "info",
            "warning"
        ]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("doctor flags a search.provider no declared integration satisfies", async () => {
    const root = await workspaceWithConfig(
        `export default {
    schemaVersion: 2,
    name: "Ghost provider",
    cards: { areas: ["api", "web", "infra", "docs"] },
    search: { provider: "ghost" }
};
`
    );
    try {
        const workspace = await loadWorkspace({ root });
        const report = await runDoctor(workspace);
        const warning = report.issues.find(
            (issue) => issue.code === "search-provider-unresolved"
        );
        assert.ok(warning);
        assert.equal(warning.severity, "warning");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
