export default {
    schemaVersion: 2,
    name: "Workfile",
    cards: {
        // What a card's `verify[].run` may be, as argv prefixes. Empty by
        // default so a project that declares nothing can run nothing; this one
        // declares the suite, because that is what decides a criterion here.
        // Spawned with no shell — the vector reaches the OS as written — and the
        // job that runs it in CI holds `permissions: {}`. See T-0188, T-0189.
        verification: {
            commands: [["node", "--test"]]
        },
        areas: ["core", "ui", "docs", "infra", "mcp", "search"]
    },
    docs: {
        sources: [
            "README.md",
            "SECURITY.md",
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
