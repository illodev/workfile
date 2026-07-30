// A plain object on purpose, not `defineProject(...)`. That call would need
// `import { defineProject } from "@illodev/workfile"` — a bare specifier Node
// resolves from this file, so the config would only load with `node_modules`
// present. Two consumers run without one: a workspace initialized via
// `pnpm dlx` before the package is installed locally, and the generated CI
// job, which runs `npx --yes @illodev/workfile@X doctor` on a clean clone.
// The loader applies `defineProject` to whatever this file exports, so
// wrapping here adds nothing but that boot-time dependency. The JSDoc
// annotation keeps the typing: it is type-only, no runtime import.

/** @type {import("@illodev/workfile").ProjectConfigInput} */
export default {
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
};

// Integrations are declared as a named export because they can carry
// functions, which do not survive the config merge. Each entry is a
// `defineProjectIntegration`-compatible object; a semantic search provider
// makes `workfile search`, the HTTP API, the UI and MCP rank hybrid results.
//
// The first-party provider runs embeddings on-device — repository content
// never leaves the machine. Guard the import for the same reason this file is
// a plain object: the config must load where the package cannot resolve.
//
// export const integrations = await (async () => {
//     try {
//         const { localSearchIntegration } = await import(
//             "@illodev/workfile-search-local"
//         );
//         return [localSearchIntegration()];
//     } catch {
//         return []; // package absent: search stays lexical
//     }
// })();
// // …and set search.provider above to "local-embeddings".
//
// Or bring your own:
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
