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
        semanticWeight: 0.35,
        maxProviderRecords: 500
    }
});
