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

export const AREAS = [
    "api",
    "client",
    "web",
    "billing",
    "time",
    "projects",
    "services",
    "mcp",
    "sdk",
    "ui",
    "fiscal",
    "docs",
    "infra",
    "marketing",
    "hr",
    "crm",
    "ia"
] as const;

export type Status = (typeof STATUSES)[number];
export type TaskType = (typeof TYPES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Area = (typeof AREAS)[number];
export type Effort = "S" | "M" | "L";
export type View =
    | "explorer"
    | "triage"
    | "flow"
    | "epics"
    | "timeline"
    | "knowledge"
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

export interface TaskResponse {
    repoRoot: string;
    tasks: Task[];
}

export type IssueSeverity = "error" | "warning" | "info";

export interface HealthIssue {
    severity: IssueSeverity;
    code: string;
    id: string | null;
    file: string | null;
    archived: boolean;
    message: string;
}

export interface HealthReport {
    generatedAt: string;
    cards: number;
    counts: Record<IssueSeverity, number>;
    ok: boolean;
    issues: HealthIssue[];
}

export type KnowledgeKind = "changelog" | "learning";

export interface KnowledgeSummary {
    kind: KnowledgeKind;
    path: string;
    repoPath: string;
    id: string;
    title: string;
    date: string | null;
    entries?: number;
    category?: string;
    severity?: string | null;
    graduated?: boolean;
    occurrences?: number | null;
}

export interface KnowledgeIndex {
    changelogs: KnowledgeSummary[];
    learnings: KnowledgeSummary[];
}

export interface KnowledgeDocument {
    kind: KnowledgeKind;
    path: string;
    repoPath: string;
    metadata: Record<string, unknown>;
    body: string;
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
