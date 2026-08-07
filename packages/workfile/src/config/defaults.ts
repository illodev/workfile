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
    "origin",
    "parent",
    "priority",
    "raised",
    "related",
    "revision",
    "scope",
    "source",
    "start",
    "status",
    "tags",
    "title",
    "type",
    "updated",
    "verified",
    "verify"
] as const);

/** What an axis name may look like: a plain, greppable frontmatter key. */
export const AXIS_NAME_RE = /^[a-z][a-z0-9_]*$/;

/**
 * The only bytes an argv element may not hold, on either side of the command
 * allowlist.
 *
 * This is a round-trip rule, not a shell-safety one. A command is spawned as an
 * argument vector with no shell, so `;`, `|`, `*` and spaces are inert bytes
 * inside one argument and are refused nowhere. Control characters are different
 * in kind: frontmatter is line-oriented, so a newline inside an element would
 * split the record on the next write and read back as something the author
 * never wrote, and a NUL truncates in every consumer that hands the vector to
 * the operating system. An element that cannot survive being written and read
 * again cannot be matched against a declared prefix either, which is the whole
 * mechanism.
 *
 * It lives here rather than beside the card module because config validation
 * runs before any module loads, the same reason `AXIS_NAME_RE` does.
 */
// eslint-disable-next-line no-control-regex
export const ARGV_CONTROL_CHARACTER_RE = /[\u0000-\u001f\u007f]/;

/**
 * How long a card-declared command may run before `card verify` gives up on it.
 *
 * There has to be a number. A command that never exits otherwise holds the
 * command that spawned it forever, and the caller most likely to meet that is
 * an unattended CI job, which has no keyboard to interrupt it with.
 *
 * Ten minutes because the commands worth declaring are test suites, and a test
 * suite that legitimately takes longer than ten minutes is a project fact
 * rather than a default — which is what `cards.verification.timeoutSeconds` is
 * for. Erring long is deliberate: a timeout that fires on a slow-but-working
 * suite reports a failure that is not one, and a false red is how a gate stops
 * being read.
 */
export const VERIFY_TIMEOUT_SECONDS_DEFAULT = 600;

/**
 * The longest timeout a project may declare.
 *
 * Twelve hours is past every honest test suite and short of "never", which is
 * the value this bound exists to keep out of the config: a workspace that
 * declares no timeout at all is the state the default above exists to prevent,
 * and `timeoutSeconds: 0` must not be a way back to it.
 */
export const VERIFY_TIMEOUT_SECONDS_MAXIMUM = 12 * 60 * 60;

/**
 * Every method a `verified` block may record.
 *
 * Here rather than beside the code that writes one, for the reason above:
 * `cards.verification.methods` is a project's policy over this vocabulary, and
 * config validation has to be able to refuse `["cy"]` before any module loads.
 * `modules/cards/verification.ts` re-exports both lists, so the module that
 * owns the meaning still owns the name every caller reaches for.
 */
export const VERIFICATION_METHODS = Object.freeze([
    "local",
    "ci",
    "manual",
    "forced"
] as const);

/**
 * The methods a caller may ask for and a project may declare, which is the
 * vocabulary above minus `forced`.
 *
 * `forced` is derived from what the acceptance gate waived and is never an
 * input. Accepting it would create two places to disagree about whether a close
 * was forced — the frontmatter and the trail line T-0184 already writes — and
 * the record would have no way to say which one was right. A project cannot
 * declare it either, for a stronger reason: a policy naming `forced` would be
 * saying that walking past a gate is an accepted way to prove work.
 */
export const REQUESTABLE_VERIFICATION_METHODS = Object.freeze([
    "local",
    "ci",
    "manual"
] as const);

/**
 * The key in `cards.verification.methods` that answers for every area the map
 * does not name.
 *
 * Without it a project with eight areas states the same rule eight times, and —
 * worse — the ninth area somebody adds next month escapes the policy in
 * silence. `*` rather than a word, because an area may legally be called
 * `default`.
 */
export const VERIFICATION_POLICY_DEFAULT_AREA = "*";

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
        // What a card's `verify[].run` is allowed to be, as argv prefixes:
        // `[["pnpm", "test"]]` permits `pnpm test` and anything that starts
        // with it. Empty, so a project that declares nothing can run nothing —
        // an allowlist that defaulted to something would be a policy nobody
        // chose. Under `cards` rather than `ci` because it bounds what a card
        // may say, which is true whether or not the `ci` module is enabled;
        // `ci.enabled: false` is a legal config and a control a module toggle
        // can switch off is a fail-open.
        verification: {
            commands: [],
            // How long one of those commands may run before `card verify`
            // stops waiting and reports it as timed out. See the constant for
            // why it is ten minutes and why it is declarable.
            timeoutSeconds: VERIFY_TIMEOUT_SECONDS_DEFAULT,
            // Which verification methods each area accepts at `done`, as
            // `{ core: ["ci"], "*": ["ci", "manual"] }`. Empty, and empty is
            // load-bearing: a project that declares nothing accepts every
            // method, which is what every workspace written before this key
            // existed already did. The default cannot be the whole vocabulary
            // instead, because "declares nothing" and "declares all three"
            // would then be indistinguishable and neither could be reported as
            // "this project has no opinion".
            methods: {}
        },
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
        // Empty by default: a repository's Markdown is paths until someone says
        // otherwise, and guessing which trees are published sites would turn a
        // real broken link into silence.
        routeRoots: [],
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
        open: true
    }
});
