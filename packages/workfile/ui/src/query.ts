import {
    PRIORITIES,
    STATUSES,
    TYPES,
    type Filters,
    type Task,
    type View
} from "./types";

const VIEWS: View[] = [
    "overview",
    "explorer",
    "triage",
    "flow",
    "epics",
    "timeline",
    "docs",
    "history",
    "memory",
    "health"
];

export function readUrlState(): {
    view: View;
    selectedId: string | null;
    filters: Filters;
} {
    const params = new URLSearchParams(location.search);
    const view = params.get("view") as View | null;
    return {
        view: view && VIEWS.includes(view) ? view : "explorer",
        selectedId: params.get("record") || params.get("card"),
        filters: {
            search: params.get("q") || "",
            status: STATUSES.includes(params.get("status") as never)
                ? (params.get("status") as Filters["status"])
                : "",
            area: params.get("area") || "",
            type: TYPES.includes(params.get("type") as never)
                ? (params.get("type") as Filters["type"])
                : "",
            priority: PRIORITIES.includes(params.get("priority") as never)
                ? (params.get("priority") as Filters["priority"])
                : "",
            milestone: params.get("milestone") || "",
            showIdeas: params.get("ideas") === "1",
            showClosed: params.get("closed") === "1"
        }
    };
}

/**
 * Reflects the current view into the address bar.
 *
 * `push` decides whether the change becomes a history entry. Navigation —
 * switching view, opening or closing a record — should be undoable with the
 * browser's Back button; typing in a filter should not bury the previous page
 * under one entry per keystroke. Everything used to be `replaceState`, so the
 * history never grew and Back left the application entirely.
 */
export function writeUrlState(
    view: View,
    filters: Filters,
    selectedId: string | null,
    { push = false }: { push?: boolean } = {}
) {
    const params = new URLSearchParams();
    if (view !== "explorer") params.set("view", view);
    if (filters.search) params.set("q", filters.search);
    if (filters.status) params.set("status", filters.status);
    if (filters.area) params.set("area", filters.area);
    if (filters.type) params.set("type", filters.type);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.milestone) params.set("milestone", filters.milestone);
    if (filters.showIdeas) params.set("ideas", "1");
    if (filters.showClosed) params.set("closed", "1");
    if (selectedId) params.set("record", selectedId);
    const query = params.toString();
    const url = `${location.pathname}${query ? `?${query}` : ""}`;
    // Rewriting the same URL as a new entry would make Back a no-op.
    if (push && url !== `${location.pathname}${location.search}`) {
        history.pushState(null, "", url);
    } else {
        history.replaceState(null, "", url);
    }
}

interface QueryToken {
    key?: string;
    value: string;
    exclude: boolean;
}

function tokenize(query: string): QueryToken[] {
    const tokens: QueryToken[] = [];
    const pattern = /(-?)(?:([a-z_]+):(?:"([^"]+)"|(\S+))|"([^"]+)"|(\S+))/gi;
    for (const match of query.matchAll(pattern)) {
        tokens.push({
            exclude: match[1] === "-",
            key: match[2]?.toLowerCase(),
            value: (
                match[3] ||
                match[4] ||
                match[5] ||
                match[6] ||
                ""
            ).toLowerCase()
        });
    }
    return tokens;
}

function tokenMatches(task: Task, token: QueryToken) {
    const values: Record<string, string[]> = {
        id: [task.id],
        status: [task.status],
        type: [task.type],
        priority: [task.priority],
        area: [task.area],
        parent: [task.parent || ""],
        milestone: [task.milestone || ""],
        source: [task.source || ""],
        tag: task.tags || [],
        effort: [task.effort || ""],
        claim: [task.claimed_by || ""],
        body: [task.body || ""]
    };
    // Free text searches identity and metadata, not prose. Including the whole
    // Markdown body meant every keystroke lower-cased megabytes: measured at
    // 8.9 ms per pass over a real backlog, against 5.6 ms for all five passes
    // without it. `body:` asks for the prose explicitly.
    const haystack = token.key
        ? values[token.key] || []
        : [
              task.id,
              task.title,
              task.source || "",
              task.parent || "",
              task.milestone || "",
              ...(task.tags || [])
          ];
    const matches = haystack.some((value) =>
        String(value).toLowerCase().includes(token.value)
    );
    return token.exclude ? !matches : matches;
}

/**
 * The same `/pattern/flags` form the search server recognises (flags a
 * subset of `imsu`), compiled for the Explorer's client-side filter. An
 * invalid or over-long pattern returns null and the query falls back to
 * plain text matching — the filter must never throw while the user types.
 */
const REGEX_QUERY = /^\/(.+)\/([imsu]*)$/s;
const REGEX_PATTERN_MAX = 256;

function compileRegexQuery(search: string): RegExp | null {
    const match = REGEX_QUERY.exec(search);
    if (!match || match[1].length > REGEX_PATTERN_MAX) return null;
    try {
        return new RegExp(match[1], match[2]);
    } catch {
        return null;
    }
}

export function filterTasks(tasks: Task[], filters: Filters) {
    const search = filters.search.trim();
    // A full-form regex query matches id, title and body directly, like the
    // server's regex mode; it bypasses the token grammar entirely.
    const matcher = compileRegexQuery(search);
    const tokens = matcher ? [] : tokenize(search);
    return tasks.filter((task) => {
        if (
            !filters.showClosed &&
            (task.archived || ["done", "discarded"].includes(task.status))
        )
            return false;
        if (
            !filters.showIdeas &&
            task.type === "idea" &&
            filters.type !== "idea"
        )
            return false;
        if (filters.status && task.status !== filters.status) return false;
        if (filters.area && task.area !== filters.area) return false;
        if (filters.type && task.type !== filters.type) return false;
        if (filters.priority && task.priority !== filters.priority)
            return false;
        if (filters.milestone && task.milestone !== filters.milestone)
            return false;
        if (matcher)
            return (
                matcher.test(task.id) ||
                matcher.test(task.title) ||
                matcher.test(task.body || "")
            );
        return tokens.every((token) => tokenMatches(task, token));
    });
}
