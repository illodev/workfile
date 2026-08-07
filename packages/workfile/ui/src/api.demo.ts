import demoData from "./demo-data.json";

import { rankByQuery } from "./record-search";

import type { ProjectApi } from "./api";
import type {
    ActivitySnapshot,
    ChangeRecord,
    BaseRecord,
    DocumentRecord,
    GraphRecord,
    HealthReport,
    SearchHit,
    HistoryRecord,
    MemoryRecord,
    RecordsResponse,
    ReleasePreview,
    ReleaseRecord,
    Task,
    TaskPatch,
    TaskResponse
} from "./types";

interface DemoData {
    tasks: TaskResponse;
    health: HealthReport;
    activity: ActivitySnapshot;
    docs: RecordsResponse<DocumentRecord>;
    changelog: RecordsResponse<HistoryRecord>;
    memory: RecordsResponse<MemoryRecord>;
    graph: RecordsResponse<GraphRecord>;
    changelogRender: { public: string; internal: string };
}

/** The demo replays a workspace snapshot entirely in memory: mutations
 *  work for the session and reset on reload. Shapes mirror the HTTP
 *  server responses the regular build talks to. */
const state = /* @__PURE__ */ structuredClone(
    demoData
) as unknown as DemoData;

const wait = (ms = 120) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

const clone = <T>(value: T): T => structuredClone(value);

const today = () => new Date().toISOString().slice(0, 10);

const revision = () =>
    `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function nextId(prefix: string, existing: Iterable<string>) {
    let max = 0;
    for (const id of existing) {
        const match = id.match(new RegExp(`^${prefix}-(\\d+)$`));
        if (match) max = Math.max(max, Number(match[1]));
    }
    return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}


/**
 * Mirrors the server's regex-query rule (`modules/search/search.ts`): the
 * trimmed full `/pattern/flags` form, flags a subset of `imsu`. Anything
 * else — a slash inside a plain query, a missing delimiter, an unknown
 * flag — ranks lexically.
 */
const REGEX_QUERY = /^\/(.+)\/([imsu]*)$/s;
const REGEX_PATTERN_MAX = 256;
const REGEX_BODY_CAP = 20_000;

function compileRegexQuery(pattern: string, flags: string) {
    if (pattern.length > REGEX_PATTERN_MAX) {
        throw new Error(
            `Regular expression patterns are capped at ${REGEX_PATTERN_MAX} characters.`
        );
    }
    // `g` so matches can be counted, exactly as the server compiles it.
    // Invalid patterns throw here with the compile message, which is what
    // the HTTP client surfaces from the server's 400 response.
    return new RegExp(pattern, `${flags}g`);
}

function countMatches(matcher: RegExp, text: string) {
    if (!text) return 0;
    matcher.lastIndex = 0;
    return [...text.matchAll(matcher)].length;
}

function searchPools(): Array<[string, Array<Record<string, unknown>>]> {
    return [
        ["card", state.tasks.tasks as unknown as Array<Record<string, unknown>>],
        ["doc", state.docs.records as unknown as Array<Record<string, unknown>>],
        [
            "change",
            state.changelog.records as unknown as Array<Record<string, unknown>>
        ],
        [
            "memory",
            state.memory.records as unknown as Array<Record<string, unknown>>
        ]
    ];
}

function searchHit(kind: string, record: Record<string, unknown>): SearchHit {
    return {
        id: String(record.id ?? ""),
        kind,
        title: String(record.title ?? ""),
        status: record.status as string | undefined,
        area: record.area as string | undefined,
        path: String(record.path ?? record.file ?? "")
    };
}

// Mirrors the server rule: list-typed keys accept the scalar a client may
// send, because a string's `.length` passes every render guard and its
// missing `.join` takes the whole view down.
const LIST_KEYS = new Set(["tags", "depends", "scope", "related", "cards"]);

function asList(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);
    return String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function applyChanges<T extends object>(
    target: T,
    changes: Record<string, unknown>
) {
    const record = target as Record<string, unknown>;
    for (const [key, value] of Object.entries(changes)) {
        if (value == null) delete record[key];
        else record[key] = LIST_KEYS.has(key) ? asList(value) : value;
    }
    record.updated = today();
    record.revision = revision();
}

function findTask(id: string): Task {
    const task = state.tasks.tasks.find((item) => item.id === id);
    if (!task) throw new Error(`Unknown card ${id}`);
    return task;
}

const isChange = (record: HistoryRecord): record is ChangeRecord =>
    record.kind === "change";

function unreleasedChanges() {
    return state.changelog.records.filter(
        (record): record is ChangeRecord => isChange(record) && !record.released
    );
}

function groupFragments(fragments: ChangeRecord[]) {
    const order = state.tasks.schema.changelog.types;
    return order
        .map((type) => ({
            type,
            fragments: fragments.filter((fragment) => fragment.type === type)
        }))
        .filter((group) => group.fragments.length > 0);
}

const heading = (type: string) =>
    type.charAt(0).toUpperCase() + type.slice(1);

function renderGroups(fragments: ChangeRecord[]) {
    return groupFragments(fragments)
        .map((group) =>
            [
                `### ${heading(group.type)}`,
                "",
                ...group.fragments.map(
                    (fragment) => `- ${fragment.title} (${fragment.id})`
                )
            ].join("\n")
        )
        .join("\n\n");
}

export const demoApi: ProjectApi = {
    tasks: async () => {
        await wait();
        return clone(state.tasks);
    },
    health: async () => {
        await wait();
        return clone(state.health);
    },
    activity: async () => {
        await wait();
        return clone(state.activity);
    },
    /**
     * Cross-collection search over the snapshot.
     *
     * The palette used to call `/api/v2/search` directly, which in a static
     * build is a 404 the catch swallowed — so the one control that searches
     * everything at once returned nothing, quietly, in the demo that exists to
     * show it off. This ranks the same four collections the server does:
     * an id match first, then a title prefix, then any substring. The
     * `/pattern/flags` form answers as a regex scan over id, title and body,
     * so the hosted demo speaks the same envelope — `mode` always present,
     * `provider` always null (the demo never runs a semantic provider).
     */
    search: async (term: string, limit = 8) => {
        await wait(60);
        const regexQuery = REGEX_QUERY.exec(term.trim());
        if (regexQuery) {
            const matcher = compileRegexQuery(regexQuery[1], regexQuery[2]);
            const scored: Array<{ score: number; hit: SearchHit }> = [];
            for (const [kind, records] of searchPools()) {
                for (const record of records) {
                    const score =
                        countMatches(matcher, String(record.id ?? "")) +
                        countMatches(matcher, String(record.title ?? "")) +
                        countMatches(
                            matcher,
                            String(record.body ?? "").slice(0, REGEX_BODY_CAP)
                        );
                    if (!score) continue;
                    scored.push({ score, hit: searchHit(kind, record) });
                }
            }
            scored.sort(
                (left, right) =>
                    right.score - left.score ||
                    left.hit.id.localeCompare(right.hit.id)
            );
            return {
                records: scored.slice(0, limit).map((entry) => entry.hit),
                total: scored.length,
                mode: "regex" as const,
                provider: null
            };
        }
        if (!term.trim())
            return {
                records: [],
                total: 0,
                mode: "lexical" as const,
                provider: null
            };
        // The server answers a lexical search with the same ranker as its list
        // routes — `searchProjectRecordsHybrid` falls through to
        // `searchProjectRecords` when no provider is configured. This branch had
        // a third rule of its own instead: id and title only, weighted
        // 100/50/25/10, so the palette in the demo could not find a record by a
        // word in its body or by its area, and ranked the ones it did find in an
        // order the server never produces.
        //
        // Ranked across every pool at once rather than pool by pool, because the
        // server scores one candidate list and the kind is not a tiebreak.
        const pools = searchPools();
        const kindOf = new Map<object, string>();
        for (const [kind, records] of pools) {
            for (const record of records) kindOf.set(record, kind);
        }
        const ranked = rankByQuery(
            pools.flatMap(([, records]) => records),
            term
        );
        return {
            records: ranked
                .slice(0, limit)
                .map((record) => searchHit(kindOf.get(record) ?? "card", record)),
            total: ranked.length,
            mode: "lexical" as const,
            provider: null
        };
    },
    // The snapshot is already the whole graph, so this is the one read that
    // needs no filtering — and no `wait()`. The others simulate latency so the
    // demo shows its loading states; a canvas that pops in after an invented
    // delay only looks broken.
    graph: async () => clone(state.graph),
    // Every pool the snapshot carries, because the caller does not know which
    // one holds the ID — that is the reason this reader exists.
    record: async (id: string) => {
        await wait();
        const pools = [
            state.docs.records,
            state.changelog.records,
            state.memory.records
        ] as unknown as Array<Array<Record<string, unknown>>>;
        for (const pool of pools) {
            const found = pool.find((entry) => entry.id === id);
            if (found) return clone({ record: found as unknown as BaseRecord });
        }
        const card = state.tasks.tasks.find((task) => task.id === id);
        if (card) {
            // A card in the snapshot is raw frontmatter, not an indexed
            // record. Filling the shape here rather than letting a reader see
            // `undefined` where the server would have sent a value.
            return clone({
                record: {
                    ...card,
                    kind: "card",
                    recordType: card.type,
                    path: card.file,
                    outgoing: [],
                    incoming: [],
                    issues: []
                } as unknown as BaseRecord
            });
        }
        throw new Error(`Unknown record ${id}`);
    },
    docs: async (query = "") => {
        await wait();
        const records = rankByQuery(state.docs.records, query);
        return clone({ records, total: records.length });
    },
    document: async (id: string) => {
        await wait();
        const record = state.docs.records.find((item) => item.id === id);
        if (!record) throw new Error(`Unknown document ${id}`);
        return clone({ record });
    },
    changelog: async (
        query = "",
        options: { state?: string; visibility?: string } = {}
    ) => {
        await wait();
        let records = state.changelog.records;
        if (options.state === "unreleased")
            records = records.filter(
                (record) => isChange(record) && !record.released
            );
        else if (options.state === "released")
            records = records.filter(
                (record) => !isChange(record) || record.released
            );
        if (options.visibility)
            records = records.filter(
                (record) =>
                    isChange(record) &&
                    record.visibility === options.visibility
            );
        records = rankByQuery(records, query);
        return clone({ records, total: records.length });
    },
    createChange: async (input: Record<string, unknown>) => {
        await wait();
        const record = {
            id: nextId(
                "CHG",
                state.changelog.records.map((item) => item.id)
            ),
            kind: "change",
            recordType: "change",
            title: String(input.title || "Untitled change"),
            type: String(input.type || "changed"),
            area: String(input.area || "general"),
            visibility: String(input.visibility || "public"),
            released: false,
            body: String(input.body || ""),
            path: "",
            file: "",
            revision: revision(),
            created: today(),
            updated: today(),
            outgoing: [],
            incoming: [],
            issues: []
        } as unknown as ChangeRecord;
        record.path = `.project/changelog/unreleased/${record.id}.md`;
        record.file = record.path;
        state.changelog.records.unshift(record);
        state.changelog.total = state.changelog.records.length;
        return clone({ record });
    },
    patchChange: async (id: string, changes: Record<string, unknown>) => {
        await wait();
        const record = state.changelog.records.find(
            (item): item is ChangeRecord => isChange(item) && item.id === id
        );
        if (!record) throw new Error(`Unknown change ${id}`);
        applyChanges(record, changes);
        return clone({ record });
    },
    releasePreview: async (input: Record<string, unknown> = {}) => {
        await wait();
        const requested = Array.isArray(input.fragments)
            ? new Set(input.fragments as string[])
            : null;
        const fragments = unreleasedChanges().filter(
            (fragment) => !requested || requested.has(fragment.id)
        );
        const markdown = `## Unreleased\n\n${renderGroups(fragments)}`;
        return clone({
            fragments,
            groups: groupFragments(fragments),
            markdown
        }) as ReleasePreview;
    },
    createRelease: async (input: Record<string, unknown>) => {
        await wait();
        const version = String(input.version || "").trim();
        if (!version) throw new Error("A release version is required");
        const ids = Array.isArray(input.fragmentIds)
            ? (input.fragmentIds as string[])
            : [];
        const fragments = unreleasedChanges().filter((fragment) =>
            ids.includes(fragment.id)
        );
        if (!fragments.length)
            throw new Error("No unreleased fragments selected");
        const record = {
            id: nextId(
                "REL",
                state.changelog.records.map((item) => item.id)
            ),
            kind: "release",
            recordType: "release",
            title: String(input.title || `v${version}`),
            version,
            date: today(),
            fragments: fragments.map((fragment) => fragment.id),
            body: renderGroups(fragments),
            path: "",
            file: "",
            revision: revision(),
            created: today(),
            updated: today(),
            outgoing: [],
            incoming: [],
            issues: []
        } as unknown as ReleaseRecord;
        record.path = `.project/changelog/releases/${record.id}.md`;
        record.file = record.path;
        for (const fragment of fragments) {
            fragment.released = true;
            fragment.releaseIds = [record.id];
        }
        state.changelog.records.unshift(record);
        state.changelog.total = state.changelog.records.length;
        return clone({ record, fragments });
    },
    renderedChangelog: async (visibility = "public") => {
        await wait();
        const releases = state.changelog.records.filter(
            (record): record is ReleaseRecord => record.kind === "release"
        );
        const visible = (fragment: ChangeRecord) =>
            visibility === "internal" || fragment.visibility === "public";
        const sections: string[] = ["# Changelog"];
        const unreleased = unreleasedChanges().filter(visible);
        if (unreleased.length)
            sections.push(`## Unreleased\n\n${renderGroups(unreleased)}`);
        for (const release of releases) {
            const fragments = state.changelog.records.filter(
                (record): record is ChangeRecord =>
                    isChange(record) &&
                    (record.releaseIds || []).includes(release.id) &&
                    visible(record)
            );
            sections.push(
                `## ${release.version} — ${release.date}\n\n${renderGroups(fragments)}`
            );
        }
        return { visibility, content: sections.join("\n\n") };
    },
    memory: async (
        query = "",
        options: { collection?: string; status?: string } = {}
    ) => {
        await wait();
        const records = rankByQuery(
            state.memory.records.filter(
                (record) =>
                    (!options.collection ||
                        record.collection === options.collection) &&
                    (!options.status || record.status === options.status)
            ),
            query
        );
        return clone({ records, total: records.length });
    },
    createMemory: async (input: Record<string, unknown>) => {
        await wait();
        const collection = String(input.collection || "learnings");
        const schema = state.tasks.schema.memory.collections.find(
            (item) => item.id === collection
        );
        if (!schema) throw new Error(`Unknown collection ${collection}`);
        const record = {
            id: nextId(
                schema.idPrefix,
                state.memory.records.map((item) => item.id)
            ),
            kind: "memory",
            recordType: schema.singular,
            collection,
            title: String(input.title || `Untitled ${schema.singular}`),
            status: String(input.status || schema.statuses[0]),
            body: String(input.body || ""),
            path: "",
            file: "",
            revision: revision(),
            created: today(),
            updated: today(),
            outgoing: [],
            incoming: [],
            issues: []
        } as unknown as MemoryRecord;
        for (const key of ["category", "confidence", "severity", "expires"])
            if (input[key])
                (record as unknown as Record<string, unknown>)[key] =
                    input[key];
        record.path = `.project/memory/${collection}/${record.id}.md`;
        record.file = record.path;
        state.memory.records.unshift(record);
        state.memory.total = state.memory.records.length;
        return clone({ record });
    },
    patchDocument: async (id: string, changes: Record<string, unknown>) => {
        await wait();
        const record = state.docs.records.find((item) => item.id === id);
        if (!record) throw new Error(`Unknown document ${id}`);
        applyChanges(record, changes);
        return clone({ record });
    },
    patchMemory: async (id: string, changes: Record<string, unknown>) => {
        await wait();
        const record = state.memory.records.find((item) => item.id === id);
        if (!record) throw new Error(`Unknown memory record ${id}`);
        applyChanges(record, changes);
        return clone({ record });
    },
    graduateMemory: async (id: string, targets: string[]) => {
        await wait();
        const record = state.memory.records.find((item) => item.id === id);
        if (!record) throw new Error(`Unknown memory record ${id}`);
        record.status = "graduated";
        record.graduated_to = targets;
        applyChanges(record, {});
        return clone({ record });
    },
    supersedeMemory: async (id: string, replacementId: string) => {
        await wait();
        const record = state.memory.records.find((item) => item.id === id);
        if (!record) throw new Error(`Unknown memory record ${id}`);
        const replacement = state.memory.records.find(
            (item) => item.id === replacementId
        );
        if (!replacement)
            throw new Error(`Unknown replacement record ${replacementId}`);
        record.status = "superseded";
        record.superseded_by = [replacementId];
        replacement.supersedes = [
            ...new Set([...(replacement.supersedes || []), id])
        ];
        applyChanges(record, {});
        return clone({ record });
    },
    patch: async (id: string, changes: TaskPatch) => {
        await wait();
        const task = findTask(id);
        applyChanges(task, changes as Record<string, unknown>);
        return clone({ ok: true as const, task });
    },
    bulkPatch: async (ids: string[], changes: TaskPatch) => {
        await wait();
        const results = [];
        for (const id of ids) {
            try {
                applyChanges(findTask(id), changes as Record<string, unknown>);
                results.push({ id, ok: true });
            } catch (error) {
                results.push({
                    id,
                    ok: false,
                    error: {
                        code: "CARD_PATCH_FAILED",
                        message:
                            error instanceof Error ? error.message : String(error)
                    }
                });
            }
        }
        const updated = results.filter((entry) => entry.ok).length;
        return {
            ok: updated === ids.length,
            updated,
            failed: ids.length - updated,
            results
        };
    },
    create: async (input: Record<string, unknown>) => {
        await wait();
        const id = nextId(
            "T",
            state.tasks.tasks.map((task) => task.id)
        );
        const slug =
            String(input.title || "card")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .slice(0, 40) || "card";
        const task = {
            id,
            file: `.project/cards/${id}-${slug}.md`,
            title: String(input.title || "Untitled card"),
            status: "backlog",
            type: String(input.type || "task"),
            priority: String(input.priority || "medium"),
            area: String(input.area || "general"),
            body: String(input.body || ""),
            archived: false,
            created: today(),
            updated: today(),
            revision: revision()
        } as unknown as Task;
        const extra = task as unknown as Record<string, unknown>;
        for (const key of [
            "effort",
            "parent",
            "milestone",
            "source",
            "tags",
            "scope"
        ]) {
            const value = input[key];
            if (Array.isArray(value) ? value.length : value)
                extra[key] = LIST_KEYS.has(key) ? asList(value) : value;
        }
        state.tasks.tasks.push(task);
        return { id, file: task.file, revision: task.revision };
    },
    archive: async (id: string, archived: boolean) => {
        await wait();
        // Mirrors the HTTP client: `archived` is the card's current state.
        findTask(id).archived = !archived;
        return { ok: true as const };
    },
    upload: async () => {
        await wait();
        throw new Error("File uploads are not available in the demo");
    }
};
