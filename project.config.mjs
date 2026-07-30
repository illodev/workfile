export default {
    schemaVersion: 2,
    name: "Workfile",
    cards: {
        areas: ["core", "ui", "docs", "infra", "mcp", "search"]
    },
    docs: {
        sources: [
            "README.md",
            "packages/workfile/docs/**/*.md",
            "packages/*/README.md"
        ],
        reviewIntervalDays: 90
    },
    changelog: {
        releaseStrategy: "semver"
    },
    agents: {
        // "claude" owns the adapter block CLAUDE.md has carried since 0.1.0 —
        // without it here, no sync ever refreshes that block and its stamp
        // fossilizes at whatever version wrote it last.
        targets: ["agents-md", "claude"]
    }
};
