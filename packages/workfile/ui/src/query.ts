import {
    PRIORITIES,
    STATUSES,
    TYPES,
    type Filters,
    type RecordFilters,
    type Task,
    type View
} from "./types";

/**
 * The views a URL may name, which the `View` union cannot supply at runtime.
 *
 * Two lists that have to agree and no compiler saying so: adding `workflow` to
 * the type and not here meant reloading on it silently answered `overview`,
 * because an unrecognised view falls back rather than failing. `schema-parity`
 * covers the pairs like this that cross the wire; this one never left the
 * bundle, so nothing was looking.
 */
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
    "workflow",
    "health"
];

/**
 * Which parameter each record view's axis filters ride in, decided here beside
 * `q` and `find`.
 *
 * Prefixed by view, every one of them, and the rule is worth more than the five
 * characters it costs. `status` is already taken — by the card filter — so
 * Memory's would have had to differ anyway, and a table where four names are
 * bare and the fifth is not invites the next author to read the exception as
 * arbitrary and drop the prefix. The prefix also keeps a new card axis and a new
 * record axis from colliding later, which is a collision nothing would report:
 * `readUrlState` validates the card `status` against `STATUSES` and answers `""`
 * for anything else, so the loser of a name clash filters by nothing and says
 * so nowhere.
 *
 * These values are *not* validated on the way in, unlike the card axes. The
 * legal ones come from the workspace schema — which collections exist, which
 * statuses each declares, which visibilities the changelog offers — and none of
 * it has been fetched when this runs. An unknown value therefore reaches the
 * server, which answers nothing, and the chip renders empty; the way out is the
 * chip's own "all", which is one click and always present.
 */
const RECORD_FILTER_PARAMS = {
    docs: { managedOnly: "docs-managed" },
    history: { state: "history-state", visibility: "history-visibility" },
    memory: { collection: "memory-collection", status: "memory-status" }
} as const;

/** Nothing narrowed, which is what a fresh URL means. */
export const NO_RECORD_FILTERS: RecordFilters = {
    docs: { managedOnly: false },
    history: { state: "", visibility: "" },
    memory: { collection: "", status: "" }
};

export function readUrlState(): {
    view: View;
    selectedId: string | null;
    recordSearch: string;
    filters: Filters;
    recordFilters: RecordFilters;
} {
    const params = new URLSearchParams(location.search);
    const view = params.get("view") as View | null;
    return {
        // The landing view. This and the `writeUrlState` guard below encode the
        // same default from opposite directions: move one without the other and
        // the address bar stops round-tripping.
        view: view && VIEWS.includes(view) ? view : "overview",
        selectedId: params.get("record") || params.get("card"),
        /**
         * Free text for docs, history and memory, which is not `q`.
         *
         * `q` is card-shaped: `filterTasks` below reads it, deliberately
         * without prose, and the work strip's reset chip clears it. The record
         * collections search on the server, over the body, through a grammar
         * the browser-side filter does not implement. One parameter for both
         * would mean a phrase typed in Memory silently narrowing the Explorer
         * table by a different rule. Kept beside `filters` rather than inside
         * it for the same reason.
         */
        recordSearch: params.get("find") || "",
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
        },
        /**
         * And the record collections' axes, which lived in three `useState`s
         * until T-0201 and so died on every reload while the free text beside
         * them survived. Kept out of `filters` for the reason stated above it:
         * these are not card filters and must not answer to the work strip.
         */
        recordFilters: {
            docs: {
                managedOnly:
                    params.get(RECORD_FILTER_PARAMS.docs.managedOnly) === "1"
            },
            history: {
                state: params.get(RECORD_FILTER_PARAMS.history.state) || "",
                visibility:
                    params.get(RECORD_FILTER_PARAMS.history.visibility) || ""
            },
            memory: {
                collection:
                    params.get(RECORD_FILTER_PARAMS.memory.collection) || "",
                status: params.get(RECORD_FILTER_PARAMS.memory.status) || ""
            }
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
 *
 * `find` and `recordFilters` ride the options bag rather than a fifth and sixth
 * positional argument: the three- and four-argument calls are the whole of how
 * the rest of the app writes a URL, and a new parameter in front of the bag
 * would rewrite them all to say nothing new. Both default to empty, so a caller
 * with no record view to reflect passes neither.
 */
export function writeUrlState(
    view: View,
    filters: Filters,
    selectedId: string | null,
    {
        push = false,
        find = "",
        recordFilters = NO_RECORD_FILTERS
    }: { push?: boolean; find?: string; recordFilters?: RecordFilters } = {}
) {
    const params = new URLSearchParams();
    if (view !== "overview") params.set("view", view);
    if (filters.search) params.set("q", filters.search);
    // Omitted when empty, so a URL without a record search is the URL it
    // always was.
    if (find) params.set("find", find);
    if (filters.status) params.set("status", filters.status);
    if (filters.area) params.set("area", filters.area);
    if (filters.type) params.set("type", filters.type);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.milestone) params.set("milestone", filters.milestone);
    if (filters.showIdeas) params.set("ideas", "1");
    if (filters.showClosed) params.set("closed", "1");
    // Each of these is set only when it narrows something, so clearing a filter
    // takes its parameter out of the address bar instead of leaving an empty one
    // behind for the next reader to inherit and wonder about.
    // `history` renamed on the way out: the bag's field is named after the view,
    // and binding that name here would shadow `window.history` for the rest of
    // this function — which ends in `history.pushState`.
    const { docs, history: changes, memory } = recordFilters;
    if (docs.managedOnly) {
        params.set(RECORD_FILTER_PARAMS.docs.managedOnly, "1");
    }
    if (changes.state) {
        params.set(RECORD_FILTER_PARAMS.history.state, changes.state);
    }
    if (changes.visibility) {
        params.set(RECORD_FILTER_PARAMS.history.visibility, changes.visibility);
    }
    if (memory.collection) {
        params.set(RECORD_FILTER_PARAMS.memory.collection, memory.collection);
    }
    if (memory.status) {
        params.set(RECORD_FILTER_PARAMS.memory.status, memory.status);
    }
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
