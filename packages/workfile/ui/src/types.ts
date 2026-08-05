export const STATUSES = [
    "backlog",
    "next",
    "doing",
    "review",
    "blocked",
    "deferred",
    "done",
    "discarded"
] as const;

export const TYPES = [
    "epic",
    "idea",
    "feature",
    "bug",
    "task",
    "audit",
    "docs",
    "chore"
] as const;

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;

export type Status = (typeof STATUSES)[number];
export type TaskType = (typeof TYPES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Area = string;
export type Effort = "S" | "M" | "L";
export type View =
    | "overview"
    | "explorer"
    | "triage"
    | "flow"
    | "epics"
    | "timeline"
    | "docs"
    | "history"
    | "memory"
    | "workflow"
    | "health";

export interface Task {
    id: string;
    file: string;
    title: string;
    status: Status;
    type: TaskType;
    priority: Priority;
    area: Area;
    body: string;
    archived: boolean;
    parent?: string;
    depends?: string[];
    /** Records this card was discovered while working on. Any record kind. */
    origin?: string[];
    related?: string[];
    milestone?: string;
    source?: string;
    tags?: string[];
    effort?: Effort;
    start?: string;
    due?: string;
    scope?: string[];
    claimed_by?: string;
    claimed_at?: string;
    created?: string;
    updated?: string;
    assets?: string[];
    revision?: string;
}

type MutableTaskFields = Pick<
    Task,
    | "title"
    | "status"
    | "type"
    | "priority"
    | "area"
    | "parent"
    | "depends"
    | "milestone"
    | "source"
    | "tags"
    | "effort"
    | "scope"
    | "claimed_by"
    | "claimed_at"
    | "start"
    | "due"
>;

export type TaskPatch = {
    [Key in keyof MutableTaskFields]?: MutableTaskFields[Key] | null;
};

export interface MemoryCollectionSchema {
    id: string;
    singular: string;
    idPrefix: string;
    statuses: string[];
}

export interface RuntimeSchema {
    schemaVersion: number;
    modules: {
        cards: boolean;
        docs: boolean;
        changelog: boolean;
        memory: boolean;
        agents?: boolean;
        ci?: boolean;
        mcp?: boolean;
    };
    cards: {
        statuses: readonly Status[];
        types: readonly TaskType[];
        priorities: readonly Priority[];
        efforts: readonly Effort[];
        areas: string[];
        /**
         * Extra classification axes this project declares, each mapped to the
         * vocabulary its values must come from. Per ADR-0008: `area` is shaped
         * like a delivery layer, and a repository that also wants a domain axis
         * declares one rather than overloading the field it has.
         *
         * Absent until the workspace has been fetched, and absent for projects
         * that declare none — which is why nothing here may assume it exists.
         */
        axes?: Record<string, string[]>;
    };
    docs: {
        kinds: string[];
        statuses: string[];
        defaults: { kind: string; status: string };
    };
    memory: { collections: MemoryCollectionSchema[] };
    mcp?: {
        transport: string;
        allowMutations: boolean;
        resourcePageSize: number;
    };
    search?: {
        semanticWeight: number;
        maxProviderRecords: number;
    };
    changelog: {
        releaseStrategy: string;
        types: string[];
        visibilities: string[];
        defaults: { type: string; visibility: string };
    };
}

export interface TaskResponse {
    repoRoot: string;
    /** When set (hosted demo), file links point here instead of vscode://. */
    repoUrl?: string;
    projectName: string;
    schema: RuntimeSchema;
    tasks: Task[];
}

export type IssueSeverity = "error" | "warning" | "info";

export interface HealthIssue {
    severity: IssueSeverity;
    code: string;
    id?: string | null;
    file?: string | null;
    archived?: boolean;
    message: string;
}

export interface HealthReport {
    generatedAt: string;
    cards: number;
    modules?: Record<string, number | undefined>;
    counts: Record<IssueSeverity, number>;
    ok: boolean;
    issues: HealthIssue[];
}

export interface RecordLink {
    id: string;
    exists?: boolean;
    /** The strongest relationship, named after the field that declared it. */
    relation?: string;
    /** All of them, strongest first — present only when there is more than one. */
    relations?: string[];
    kind?: string;
    title?: string;
    path?: string;
}

export interface RecordIssue {
    severity: IssueSeverity;
    code: string;
    id?: string;
    file?: string;
    message: string;
}

/**
 * A record as the Workflow canvas needs it: identity enough to draw a node,
 * and its outgoing edges. No body, no excerpt, no dates, and no per-link title
 * — the canvas already holds the node an edge points at.
 */
export interface GraphEdge {
    to: string;
    /** Every relationship this pair holds, strongest first. */
    rel: string[];
}

export interface GraphRecord {
    id: string;
    kind: string;
    recordType: string;
    title: string;
    status?: string;
    area?: string;
    /** Cards only, and only when set — the graph projection omits empties. */
    priority?: string;
    milestone?: string;
    archived?: boolean;
    edges: GraphEdge[];
}

export interface BaseRecord {
    id: string;
    kind: string;
    recordType: string;
    title: string;
    path: string;
    file: string;
    body: string;
    revision: string;
    tags?: string[];
    created?: string;
    updated?: string;
    outgoing: RecordLink[];
    /** Capped; `incomingTotal` carries the true count. */
    incoming: RecordLink[];
    incomingTotal?: number;
    issues: RecordIssue[];
    searchScore?: number;
}

export interface DocumentRecord extends BaseRecord {
    kind: "doc";
    managed: boolean;
    documentKind: string;
    status: string;
    owners?: string[];
    related?: string[];
    supersedes?: string[];
    scope?: string[];
    reviewed?: string;
    modifiedAt: string;
    sizeBytes: number;
    freshness: RecordIssue[];
}

export interface ChangeRecord extends BaseRecord {
    kind: "change";
    type: string;
    area: string;
    visibility: string;
    released: boolean;
    cards?: string[];
    externalIssues?: string[];
    decisions?: string[];
    related?: string[];
    releaseIds?: string[];
}

export interface ReleaseRecord extends BaseRecord {
    kind: "release";
    version: string;
    date: string;
    fragments: string[];
    commit?: string;
}

export type HistoryRecord = ChangeRecord | ReleaseRecord;

export interface MemoryRecord extends BaseRecord {
    kind: "memory";
    collection: string;
    status: string;
    category?: string;
    confidence?: string;
    occurrences?: number;
    severity?: string;
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
    lifecycleIssues?: RecordIssue[];
}

export interface RecordsResponse<T> {
    records: T[];
    total: number;
    offset?: number;
    limit?: number;
}

export interface ReleasePreview {
    fragments: ChangeRecord[];
    groups: Array<{ type: string; fragments: ChangeRecord[] }>;
    markdown: string;
}

export interface Filters {
    search: string;
    status: "" | Status;
    area: "" | Area;
    type: "" | TaskType;
    priority: "" | Priority;
    milestone: string;
    showIdeas: boolean;
    showClosed: boolean;
}

export type SortKey =
    | "id"
    | "title"
    | "type"
    | "status"
    | "priority"
    | "area"
    | "epic"
    | "updated";

export interface ClaimEntry {
    id: string;
    title: string;
    status: string;
    area?: string;
    scope: string[];
    claim: {
        by: string;
        at: string | null;
        ageHours: number | null;
        state: "live" | "held" | "stale" | "orphaned" | "unclaimed";
        sessionId: string | null;
    };
}

/**
 * The verdict `claimState()` ships for a claim, derived from the interface's
 * own type so the two cannot drift. The lease that turns a hold `stale` is
 * `cards.claimLeaseHours`, applied on the server; the interface renders the
 * state it is given and never re-derives it from an age.
 */
export type ClaimState = ClaimEntry["claim"]["state"];

export interface ActivitySnapshot {
    generatedAt: string;
    sessions: Array<{
        sessionId: string;
        actor: string | null;
        cardId: string | null;
        live: boolean;
        ageMs: number | null;
        filesTouched: string[];
    }>;
    claims: ClaimEntry[];
    conflicts: Array<{ cards: string[]; paths: string[] }>;
    writing: Array<{ recordId: string | null; module: string | null }>;
}

export interface SearchHit {
    id: string;
    kind: string;
    title: string;
    status?: string;
    area?: string;
    path: string;
}

export type SearchMode = "lexical" | "hybrid" | "regex";

/**
 * `/api/v2/search` envelope. `mode` is always present; `provider` is the
 * semantic provider id when `mode` is "hybrid" and null otherwise — regex
 * bypasses the provider by design. `view` is present on lexical and regex
 * responses but absent on hybrid ones, so it stays optional here.
 */
export interface SearchResponse {
    records: SearchHit[];
    total: number;
    offset?: number;
    limit?: number;
    mode: SearchMode;
    provider: string | null;
    view?: string;
}
