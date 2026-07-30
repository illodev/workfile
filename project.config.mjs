export default {
    schemaVersion: 2,
    name: "Workfile",
    cards: {
        areas: ["core", "ui", "docs", "infra", "mcp", "search"]
    },
    docs: {
        sources: ["README.md", "docs/**/*.md"],
        reviewIntervalDays: 90
    },
    changelog: {
        releaseStrategy: "semver"
    },
    agents: {
        targets: ["agents-md"]
    }
};
