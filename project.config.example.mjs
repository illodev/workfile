import { defineProject } from "@illodev/workfile";

export default defineProject({
    schemaVersion: 2,
    name: "Example project",
    language: "es",
    cards: {
        areas: ["api", "web", "infra", "docs"]
    },
    docs: {
        managedPath: ".project/docs",
        sources: [
            "README.md",
            "docs/**/*.md",
            "apps/*/README.md",
            ".project/specs/**/*.md"
        ],
        exclude: [
            "**/node_modules/**",
            "**/vendor/**",
            ".git/**",
            ".project/.cache/**"
        ],
        kinds: [
            "architecture",
            "product",
            "runbook",
            "guide",
            "reference",
            "research",
            "spec",
            "handoff"
        ],
        statuses: ["draft", "current", "stale", "superseded", "archived"],
        defaultKind: "reference",
        defaultStatus: "draft",
        reviewIntervalDays: 180
    },
    changelog: {
        fragmentsPath: ".project/changelog/unreleased",
        releasesPath: ".project/changelog/releases",
        output: "CHANGELOG.md",
        releaseStrategy: "semver",
        types: [
            "added",
            "changed",
            "fixed",
            "deprecated",
            "removed",
            "security",
            "internal"
        ],
        visibilities: ["public", "internal"],
        defaultType: "changed",
        defaultVisibility: "public"
    },
    memory: {
        path: ".project/memory",
        collections: [
            "learnings",
            "decisions",
            "incidents",
            "conventions",
            "context"
        ]
    },
    agents: {
        canonicalInstructions: ".project/agents/protocol.md",
        workflowsPath: ".project/agents/workflows",
        targets: ["agents-md", "claude", "cursor", "copilot"]
    },
    ci: {
        targets: ["github"],
        nodeVersion: "22"
    },
    mcp: {
        enabled: true,
        transport: "stdio",
        allowMutations: true,
        resourcePageSize: 100
    },
    search: {
        // Preferred integration id for semantic search; null picks the first
        // declared integration that offers one.
        provider: null,
        semanticWeight: 0.35,
        maxProviderRecords: 500
    }
});

// Integrations are declared as a named export because they can carry
// functions, which do not survive the config merge. Each entry is a
// `defineProjectIntegration`-compatible object; a semantic search provider
// makes `workfile search`, the HTTP API, the UI and MCP rank hybrid results.
//
// import { createSemanticSearchProvider } from "@illodev/workfile";
//
// export const integrations = [
//     {
//         id: "my-embeddings",
//         title: "My embeddings provider",
//         semanticSearchProvider: createSemanticSearchProvider({
//             id: "my-embeddings",
//             async search({ query, records }) {
//                 return records.map(({ id }) => ({ id, score: 0 }));
//             }
//         })
//     }
// ];
