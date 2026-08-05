export type CardStatus =
    | "backlog"
    | "next"
    | "doing"
    | "review"
    | "blocked"
    | "deferred"
    | "done"
    | "discarded";

export type CardType =
    | "epic"
    | "idea"
    | "feature"
    | "bug"
    | "task"
    | "audit"
    | "docs"
    | "chore";

export type CardPriority = "critical" | "high" | "medium" | "low";
export type CardEffort = "S" | "M" | "L";
export type ReleaseStrategy = "semver" | "calendar" | "freeform";
export type ChangeVisibility = "public" | "internal";
export type MemoryCollection =
    | "learnings"
    | "decisions"
    | "incidents"
    | "conventions"
    | "context";
export type AgentTarget = "agents-md" | "claude" | "cursor" | "copilot";
export type CiTarget = "github" | "gitlab" | "generic";

export interface ProjectStorageConfig {
    root: string;
    cache: string;
}

export interface ProjectCardsConfig {
    enabled: boolean;
    path: string;
    archivePath: string;
    assetsPath: string;
    idPrefix: string;
    maxHierarchyDepth: number;
    claimLeaseHours: number;
    areas: string[];
    /**
     * A second classification axis per project — `{ context: ["treasury"] }`
     * makes `context:` a validated flat frontmatter key on every card. Declared
     * here rather than named in the schema; see ADR-0008.
     */
    axes: Record<string, string[]>;
    tags: string[];
    /**
     * What this project will let a card's `verify` block run, and what it will
     * accept as proof at `done`.
     *
     * `commands` is a list of argument-vector prefixes, empty by default: a
     * project that declares nothing can run nothing. `methods` maps an area —
     * or `*`, which answers for every area the map does not name, including
     * ones added after the policy was written — to the methods it accepts.
     *
     * Under `cards` rather than `ci` because `ci.enabled: false` is a legal
     * config, and a control a module toggle can switch off is a control that
     * fails open.
     */
    verification: ProjectVerificationConfig;
}

export interface ProjectVerificationConfig {
    commands: string[][];
    /** How long one declared command may run before it is cut off. */
    timeoutSeconds: number;
    methods: Record<string, VerificationMethod[]>;
}

export type DocumentLayout = "flat" | "kind";

export interface ProjectDocsConfig {
    enabled: boolean;
    managedPath: string;
    /**
     * Where `doc create` writes: "flat" uses the managed root, "kind" groups
     * documents into a folder named after their kind. Loading always recurses,
     * so both layouts (and hand-made folders) are readable either way.
     */
    layout: DocumentLayout;
    sources: string[];
    exclude: string[];
    idPrefix: string;
    kinds: string[];
    statuses: string[];
    defaultKind: string;
    defaultStatus: string;
    reviewIntervalDays: number;
    maxFileBytes: number;
}

export interface ProjectChangelogConfig {
    enabled: boolean;
    fragmentsPath: string;
    releasesPath: string;
    output: string;
    releaseStrategy: ReleaseStrategy;
    idPrefix: string;
    releasePrefix: string;
    types: string[];
    visibilities: ChangeVisibility[];
    defaultType: string;
    defaultVisibility: ChangeVisibility;
}

export interface ProjectMemoryConfig {
    enabled: boolean;
    path: string;
    collections: MemoryCollection[];
}

export interface ProjectAgentsConfig {
    enabled: boolean;
    canonicalInstructions: string;
    workflowsPath: string;
    targets: AgentTarget[];
}

export interface ProjectCiConfig {
    enabled: boolean;
    targets: CiTarget[];
    nodeVersion: string;
}

export interface ProjectMcpConfig {
    enabled: boolean;
    transport: "stdio";
    allowMutations: boolean;
    resourcePageSize: number;
    maxMessageBytes: number;
    maxToolResultBytes: number;
}

export interface ProjectSearchConfig {
    /** Preferred integration id for semantic search; null uses the first one that offers it. */
    provider: string | null;
    semanticWeight: number;
    maxProviderRecords: number;
}

export interface ProjectUiConfig {
    host: string;
    port: number;
    open: boolean;
}

export interface ProjectConfig {
    schemaVersion: 2;
    name: string;
    storage: ProjectStorageConfig;
    cards: ProjectCardsConfig;
    docs: ProjectDocsConfig;
    changelog: ProjectChangelogConfig;
    memory: ProjectMemoryConfig;
    agents: ProjectAgentsConfig;
    ci: ProjectCiConfig;
    mcp: ProjectMcpConfig;
    search: ProjectSearchConfig;
    ui: ProjectUiConfig;
}

export type DeepPartial<T> = T extends readonly (infer Item)[]
    ? Item[]
    : T extends object
      ? { [Key in keyof T]?: DeepPartial<T[Key]> }
      : T;

export type ProjectConfigInput = DeepPartial<ProjectConfig> & {
    /**
     * @deprecated Read by nothing since ADR-0012, which removed the localized
     * protocol surface. It stays on the input type because `init` wrote it into
     * every `project.config.mjs` it generated before 0.6.x, and a typed config
     * that still declares it must keep compiling — the same reason the loader
     * accepts it. Setting it has no effect.
     */
    language?: string;
};

export interface ProjectWorkspacePaths {
    root: string;
    protocolRoot: string;
    cache: string;
    cards: string;
    cardArchive: string;
    assets: string;
    docs: string;
    changelogFragments: string;
    changelogReleases: string;
    memory: string;
    agentProtocol: string;
    agentWorkflows: string;
    migrations: string;
    sources: string;
}

export interface WorkspaceVersion {
    schemaVersion: number;
    createdWith?: string;
    createdAt?: string;
    [key: string]: unknown;
}

export interface EffectiveProjectSchema {
    schemaVersion: number;
    modules: Record<string, boolean>;
    cards: {
        statuses: CardStatus[];
        types: CardType[];
        priorities: CardPriority[];
        efforts: CardEffort[];
        areas: string[];
        /** Project-declared classification axes, name → vocabulary. */
        axes: Record<string, string[]>;
        /** What a card may run, and what counts as proof at `done`. */
        verification: ProjectVerificationConfig;
    };
    docs: {
        kinds: string[];
        statuses: string[];
        layout: DocumentLayout;
        managedPath: string;
        defaults: { kind: string; status: string };
    };
    memory: {
        collections: Array<{
            id: MemoryCollection;
            singular: string;
            idPrefix: string;
            statuses: readonly string[];
        }>;
    };
    agents: {
        targets: AgentTarget[];
        canonicalInstructions: string;
        workflowsPath: string;
    };
    ci: { targets: CiTarget[]; nodeVersion: string };
    mcp: {
        transport: "stdio";
        allowMutations: boolean;
        resourcePageSize: number;
    };
    search: ProjectSearchConfig;
    changelog: {
        releaseStrategy: ReleaseStrategy;
        types: string[];
        visibilities: ChangeVisibility[];
        defaults: { type: string; visibility: ChangeVisibility };
    };
}

export interface ProjectWorkspace {
    root: string;
    configPath: string;
    config: ProjectConfig;
    version: WorkspaceVersion | null;
    paths: ProjectWorkspacePaths;
    schema: EffectiveProjectSchema;
    readOnly: boolean;
    /** Detected from the lockfile; drives how generated instructions invoke the CLI. */
    packageManager: string;
    /** The command prefix generated instructions use, e.g. `pnpm workfile`. */
    cli: string;
    /**
     * Integrations declared by the config module's named `integrations` export.
     * A named export because `defineProject` deep-clones the default export,
     * and functions do not survive `structuredClone`.
     */
    integrations: readonly ProjectIntegration[];
}

export interface ProjectDiagnostic {
    severity: "error" | "warning" | "info";
    code: string;
    message: string;
    id?: string;
    file?: string;
    path?: string;
    details?: unknown;
}

export interface BaseProjectRecord {
    id: string;
    title: string;
    kind: "card" | "doc" | "change" | "release" | "memory";
    recordType: string;
    path: string;
    body?: string;
    revision?: string;
    outgoing?: ProjectRecordLink[];
    incoming?: ProjectRecordLink[];
    [key: string]: unknown;
}

export interface CardRecord extends BaseProjectRecord {
    kind: "card";
    status: CardStatus;
    type: CardType;
    priority: CardPriority;
    area: string;
    file: string;
    archived: boolean;
    body: string;
    created: string;
    updated: string;
    assets?: string[];
    parent?: string;
    depends?: string[];
    related?: string[];
    /**
     * Records this card came out of.
     *
     * Provenance, not decomposition: `parent` says the card is part of another,
     * `origin` says it was discovered while working on one. Holds ids of any
     * kind, because decisions and learnings spawn work as often as cards do.
     */
    origin?: string[];
    scope?: string[];
    tags?: string[];
    claimed_by?: string;
    claimed_at?: string;
    /**
     * Commands that prove this card's criteria, per ADR-0016.
     *
     * `run` is an argument vector rather than a shell line, and that is what
     * makes the project's allowlist mean anything: the array the matcher
     * compares is the one the operating system receives, with no shell parse in
     * between, so a prefix match is element-wise equality rather than a
     * prediction about what a shell would do with the rest of the line.
     *
     * `criteria` holds digests of the criterion text each command proves. A
     * criterion named here is machine-owned and `card ac --check` refuses it.
     */
    verify?: CardVerifyEntry[];
    /** Written by the gate when the card reaches `done`, cleared when it leaves. */
    verified?: CardVerification;
}

export interface CardVerifyEntry {
    id: string;
    run: string[];
    criteria?: string[];
}

/**
 * How a card was shown to be done.
 *
 * The tiers carry more weight than the digest does. `local` ran on the author's
 * machine and stays self-reported, `ci` has a witness, `manual` is legitimate
 * for a criterion no command expresses but must be labelled rather than left
 * indistinguishable from a green test, and `forced` is a gate that was waived.
 */
export type VerificationMethod = "local" | "ci" | "manual" | "forced";

export interface CardVerification {
    at: string;
    method: VerificationMethod;
    /** Absent when the workspace is not a git repository. */
    commit?: string;
    /** The run that witnessed it — a CI run URL, for `method: ci`. */
    run?: string;
    /** Over the criteria region and the `verify` block, and nothing else. */
    digest?: string;
}

export interface DocumentRecord extends BaseProjectRecord {
    kind: "doc";
    documentKind: string;
    status: string;
    file: string;
    body: string;
    managed: boolean;
    created?: string;
    updated?: string;
    owners?: string[];
    related?: string[];
    supersedes?: string[];
    scope?: string[];
    tags?: string[];
}

export interface ChangeRecord extends BaseProjectRecord {
    kind: "change";
    type: string;
    area: string;
    visibility: ChangeVisibility;
    file: string;
    body: string;
    released: boolean;
    created: string;
    updated: string;
    cards?: string[];
    decisions?: string[];
    related?: string[];
    tags?: string[];
}

export interface ReleaseRecord extends BaseProjectRecord {
    kind: "release";
    version: string;
    date: string;
    file: string;
    body: string;
    fragments: string[];
    commit?: string;
    tags?: string[];
}

export interface MemoryRecord extends BaseProjectRecord {
    kind: "memory";
    collection: MemoryCollection;
    status: string;
    file: string;
    body: string;
    created: string;
    updated: string;
    related?: string[];
    supersedes?: string[];
    superseded_by?: string[];
    graduated_to?: string[];
    tags?: string[];
}

export type ProjectRecord =
    | CardRecord
    | DocumentRecord
    | ChangeRecord
    | ReleaseRecord
    | MemoryRecord;

export interface ProjectRecordLink {
    id: string;
    /**
     * The strongest relationship this edge carries, named after the field that
     * declared it: `parent`, `depends`, `origin`, `related`, `supersedes`,
     * `cards`, `fragments` and so on, plus `source`, `markdown` for a link to a
     * document's path, `wikilink` for `[[T-0042]]`, and `mention` for a bare ID
     * in prose.
     */
    relation: string;
    /**
     * Every relationship the pair holds, strongest first, and present **only
     * when there is more than one** — read it as `relations ?? [relation]`. A
     * card can come out of another and also depend on it.
     */
    relations?: string[];
    exists?: boolean;
    kind?: ProjectRecord["kind"];
    title?: string;
    path?: string;
}

export interface SemanticSearchMatch {
    id: string;
    score: number;
}

export interface SemanticSearchRecord {
    id: string;
    kind: ProjectRecord["kind"];
    recordType: string;
    title: string;
    path: string;
    status?: unknown;
    area?: unknown;
    tags: unknown[];
    body: string;
}

export interface SemanticSearchProvider {
    id: string;
    search(input: {
        query: string;
        records: SemanticSearchRecord[];
        limit?: number;
    }): Promise<SemanticSearchMatch[]>;
}

export interface ProjectIntegration {
    id: string;
    semanticSearchProvider?: SemanticSearchProvider;
    healthCheck?(context: {
        workspace: ProjectWorkspace;
        index: unknown;
    }): Promise<ProjectDiagnostic[]> | ProjectDiagnostic[];
}

export interface CreateCardInput {
    title: string;
    area?: string;
    type?: CardType;
    priority?: CardPriority;
    status?: CardStatus;
    body?: string;
    parent?: string;
    depends?: string[];
    milestone?: string;
    source?: string;
    tags?: string[];
    effort?: CardEffort;
    scope?: string[];
    related?: string[];
    /** Records this card came out of; see `CardRecord.origin`. */
    origin?: string[];
    start?: string;
    due?: string;
    claimed_by?: string;
    claimed_at?: string;
}

export type CardChanges = Partial<
    Omit<CardRecord, "id" | "kind" | "recordType" | "path" | "file" | "revision">
>;

export interface RevisionOptions {
    expectedRevision?: string;
}

export interface CardMutationOptions extends RevisionOptions {
    actor?: string;
    scope?: string[];
    now?: string | Date;
    force?: boolean;
    reason?: string;
    /** How this close was proved; recorded in `verified` when the card reaches `done`. */
    method?: VerificationMethod;
    /** The witness for it — a CI run URL. */
    run?: string;
    /** Prose a `manual` close is refused without: what was checked, and how. */
    evidence?: string;
}

export interface RecordMutationResult<RecordType extends ProjectRecord> {
    id: string;
    file: string;
    path: string;
    revision: string;
    card?: RecordType extends CardRecord ? RecordType : never;
    document?: RecordType extends DocumentRecord ? RecordType : never;
    fragment?: RecordType extends ChangeRecord ? RecordType : never;
    record?: RecordType extends MemoryRecord ? RecordType : never;
}

export interface CreateDocumentInput {
    title: string;
    kind?: string;
    status?: string;
    /**
     * Folder below `docs.managedPath`. Wins over `docs.layout`; an empty string
     * forces the managed root. `../` escapes are rejected.
     */
    folder?: string;
    body?: string;
    owners?: string[];
    related?: string[];
    supersedes?: string[];
    scope?: string[];
    tags?: string[];
    reviewed?: string;
    review_interval_days?: number;
}

export interface CreateChangeInput {
    title: string;
    type?: string;
    area?: string;
    visibility?: ChangeVisibility;
    body?: string;
    cards?: string[];
    issues?: string[];
    decisions?: string[];
    related?: string[];
    tags?: string[];
}

export interface CreateReleaseInput {
    version?: string;
    title?: string;
    date?: string;
    commit?: string;
    body?: string;
    fragmentIds?: string[];
    tags?: string[];
}

export interface CreateMemoryInput {
    title: string;
    status?: string;
    body?: string;
    category?: string;
    confidence?: "low" | "medium" | "high";
    occurrences?: number;
    severity?: "critical" | "high" | "medium" | "low";
    started_at?: string;
    resolved_at?: string;
    expires?: string;
    review_after?: string;
    deciders?: string[];
    related?: string[];
    supersedes?: string[];
    superseded_by?: string[];
    graduated_to?: string[];
    corrective_actions?: string[];
    scope?: string[];
    owners?: string[];
    tags?: string[];
}

export interface ProjectSearchOptions {
    kinds?: string[];
    limit?: number;
    offset?: number;
    /**
     * How much of each record to return. `summary` drops the Markdown body in
     * favour of `bodyBytes` and a short excerpt; `list` drops the excerpt too.
     */
    view?: "full" | "summary" | "list";
    /** Exact keys to return. Overrides `view`. */
    fields?: string[] | null;
}

export interface HybridSearchOptions extends ProjectSearchOptions {
    provider?: SemanticSearchProvider | null;
    semanticWeight?: number;
    maxProviderRecords?: number;
}

export interface ProjectSearchResult<RecordType extends ProjectRecord = ProjectRecord> {
    records: Array<
        RecordType & {
            searchScore?: number;
            lexicalScore?: number;
            semanticScore?: number;
        }
    >;
    total: number;
    offset: number;
    limit: number;
    view?: "full" | "summary" | "list";
    mode?: "lexical" | "hybrid" | "regex";
    provider?: string | null;
}

export interface ProjectIndex {
    records: ProjectRecord[];
    byId: Map<string, ProjectRecord>;
    reports: Record<string, unknown>;
    counts: Record<string, number>;
    unreadable: unknown[];
    generatedAt: string;
    [key: string]: unknown;
}

export interface DoctorReport {
    ok: boolean;
    schemaVersion: number;
    counts: { error: number; warning: number; info?: number };
    issues: ProjectDiagnostic[];
    [key: string]: unknown;
}
