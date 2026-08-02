export const SCHEMA_VERSION = 2;

export const CARD_STATUSES = Object.freeze([
    "backlog",
    "next",
    "doing",
    "review",
    "blocked",
    "deferred",
    "done",
    "discarded"
] as const);

export const CARD_TYPES = Object.freeze([
    "epic",
    "idea",
    "feature",
    "bug",
    "task",
    "audit",
    "docs",
    "chore"
] as const);

export const CARD_PRIORITIES = Object.freeze([
    "critical",
    "high",
    "medium",
    "low"
] as const);

export const CARD_EFFORTS = Object.freeze(["S", "M", "L"] as const);

/**
 * Frontmatter keys a card already owns, and which an axis therefore cannot be.
 *
 * A declared axis becomes a flat frontmatter key (ADR-0008), so declaring
 * `axes: { status: [...] }` would put a project vocabulary on top of the
 * protocol's own field and the write path would validate the value twice
 * against two different lists. Declaring `axes: { scope: [...] }` is worse: it
 * is list-typed, so the value would round-trip as an array and never match a
 * scalar vocabulary.
 *
 * This list lives here rather than beside the card module because config
 * validation runs before any module loads. `cards.test.ts` pins it against
 * `CARD_REQUIRED_KEYS`, `CARD_LIST_KEYS` and `CARD_PATCHABLE_FIELDS` so a field
 * added to a card cannot quietly become declarable as an axis.
 */
export const CARD_RESERVED_KEYS = Object.freeze([
    "archived",
    "area",
    "body",
    "claimed_at",
    "claimed_by",
    "created",
    "depends",
    "due",
    "effort",
    "file",
    "id",
    "milestone",
    "parent",
    "priority",
    "related",
    "revision",
    "scope",
    "source",
    "start",
    "status",
    "tags",
    "title",
    "type",
    "updated"
] as const);

/** What an axis name may look like: a plain, greppable frontmatter key. */
export const AXIS_NAME_RE = /^[a-z][a-z0-9_]*$/;

export const DOC_KINDS = Object.freeze([
    "architecture",
    "product",
    "runbook",
    "guide",
    "reference",
    "research",
    "spec",
    "handoff"
] as const);

/** How `workfile doc create` lays managed documents out on disk. */
export const DOC_LAYOUTS = Object.freeze(["flat", "kind"] as const);

export const DOC_STATUSES = Object.freeze([
    "draft",
    "current",
    "stale",
    "superseded",
    "archived"
] as const);

export const CHANGE_TYPES = Object.freeze([
    "added",
    "changed",
    "fixed",
    "deprecated",
    "removed",
    "security",
    "internal"
] as const);

export const CHANGE_VISIBILITIES = Object.freeze(["public", "internal"] as const);


export const AGENT_TARGET_IDS = Object.freeze([
    "agents-md",
    "claude",
    "cursor",
    "copilot"
] as const);

export const CI_TARGET_IDS = Object.freeze(["github", "gitlab", "generic"] as const);

export const MEMORY_DEFINITIONS = Object.freeze({
    learnings: Object.freeze({
        singular: "learning",
        idPrefix: "LRN",
        statuses: Object.freeze([
            "active",
            "graduated",
            "superseded",
            "discarded"
        ])
    }),
    decisions: Object.freeze({
        singular: "decision",
        idPrefix: "ADR",
        statuses: Object.freeze([
            "proposed",
            "accepted",
            "rejected",
            "superseded"
        ])
    }),
    incidents: Object.freeze({
        singular: "incident",
        idPrefix: "INC",
        statuses: Object.freeze(["open", "mitigated", "resolved", "closed"])
    }),
    conventions: Object.freeze({
        singular: "convention",
        idPrefix: "CONV",
        statuses: Object.freeze([
            "draft",
            "active",
            "deprecated",
            "superseded"
        ])
    }),
    context: Object.freeze({
        singular: "context",
        idPrefix: "CTX",
        statuses: Object.freeze(["active", "expired", "resolved"])
    })
});

export const DEFAULT_CONFIG = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    language: "en",
    storage: {
        root: ".project",
        cache: ".project/.cache"
    },
    cards: {
        enabled: true,
        path: ".project/cards",
        archivePath: ".project/cards/archive",
        assetsPath: ".project/assets",
        idPrefix: "T",
        maxHierarchyDepth: 2,
        claimLeaseHours: 24,
        // A durable, append-only trail of protocol milestones inside each
        // card. Five to fifteen lines over its whole life, reviewable in a
        // diff — not a log, and never file edits.
        activityTrail: true,
        areas: ["general"],
        // A second classification axis, declared per project rather than named
        // in the schema — see ADR-0008. `{ context: ["treasury", "billing"] }`
        // makes `context:` a validated frontmatter key on every card.
        axes: {},
        tags: []
    },
    docs: {
        enabled: true,
        managedPath: ".project/docs",
        layout: "kind",
        sources: ["README.md", "docs/**/*.md", ".project/specs/**/*.md"],
        exclude: [
            "**/node_modules/**",
            "**/vendor/**",
            ".git/**",
            ".project/.cache/**"
        ],
        idPrefix: "DOC",
        kinds: [...DOC_KINDS],
        statuses: [...DOC_STATUSES],
        defaultKind: "reference",
        defaultStatus: "draft",
        reviewIntervalDays: 180,
        maxFileBytes: 2 * 1024 * 1024
    },
    changelog: {
        enabled: true,
        fragmentsPath: ".project/changelog/unreleased",
        releasesPath: ".project/changelog/releases",
        output: "CHANGELOG.md",
        releaseStrategy: "semver",
        idPrefix: "CHG",
        releasePrefix: "REL",
        types: [...CHANGE_TYPES],
        visibilities: [...CHANGE_VISIBILITIES],
        defaultType: "changed",
        defaultVisibility: "public"
    },
    memory: {
        enabled: true,
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
        enabled: true,
        canonicalInstructions: ".project/agents/protocol.md",
        workflowsPath: ".project/agents/workflows",
        targets: ["agents-md"]
    },
    ci: {
        enabled: true,
        targets: [],
        nodeVersion: "22"
    },
    mcp: {
        enabled: true,
        transport: "stdio",
        allowMutations: true,
        resourcePageSize: 100,
        maxMessageBytes: 1024 * 1024,
        maxToolResultBytes: 512 * 1024
    },
    search: {
        provider: null,
        semanticWeight: 0.35,
        maxProviderRecords: 500
    },
    ui: {
        host: "127.0.0.1",
        port: 4747,
        open: true,
        defaultView: "work"
    }
});
