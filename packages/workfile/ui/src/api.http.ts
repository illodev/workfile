import type {
    ChangeRecord,
    DocumentRecord,
    ActivitySnapshot,
    HealthReport,
    SearchHit,
    HistoryRecord,
    MemoryRecord,
    RecordsResponse,
    ReleasePreview,
    ReleaseRecord,
    TaskPatch,
    TaskResponse
} from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        // The server now answers 304 to a conditional GET, and `no-store` would
        // stop the browser from ever sending one.
        cache: "no-cache",
        ...init,
        headers: {
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
            ...init?.headers
        }
    });
    if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
            error?:
                | string
                | { code?: string; message?: string; details?: unknown };
        };
        const message =
            typeof payload.error === "string"
                ? payload.error
                : payload.error?.message;
        const failure = new Error(
            message || `Request failed (${response.status})`
        ) as Error & { code?: string; details?: unknown; status?: number };
        // Conflicts carry the record as it now stands. Discarding it here left
        // the interface with nothing to show but a red banner, and no way to
        // recover an edit except retyping it.
        if (typeof payload.error === "object") {
            failure.code = payload.error?.code;
            failure.details = payload.error?.details;
        }
        failure.status = response.status;
        throw failure;
    }
    return (await response.json()) as T;
}

async function collect<T>(path: string, params: URLSearchParams) {
    const records: T[] = [];
    let offset = 0;
    const limit = 500;
    let total = 0;
    do {
        params.set("limit", String(limit));
        params.set("offset", String(offset));
        const page = await request<RecordsResponse<T>>(
            `${path}?${params.toString()}`
        );
        records.push(...page.records);
        total = page.total;
        offset += page.records.length;
        if (!page.records.length) break;
    } while (offset < total);
    return { records, total } satisfies RecordsResponse<T>;
}

export const httpApi = {
    /**
     * Workspace identity and the runtime schema, plus the card corpus.
     *
     * Two v2 requests rather than one call to the legacy `/api/tasks`, which
     * could express neither `q`/`limit`/`offset` nor a field projection — so
     * every refresh returned the entire corpus with every Markdown body. The
     * cards request carries an ETag, so a refresh that finds nothing changed
     * costs a header exchange.
     */
    tasks: async (): Promise<TaskResponse> => {
        const [workspace, cards] = await Promise.all([
            request<{
                name: string;
                root: string;
                readOnly: boolean;
                schema: TaskResponse["schema"];
                repoUrl?: string;
            }>("/api/v2/workspace"),
            collect<import("./types").Task>(
                "/api/v2/cards",
                new URLSearchParams()
            )
        ]);
        return {
            repoRoot: workspace.root,
            repoUrl: workspace.repoUrl,
            projectName: workspace.name,
            schema: workspace.schema,
            tasks: cards.records
        };
    },
    health: () => request<HealthReport>("/api/v2/health"),
    activity: () => request<ActivitySnapshot>("/api/v2/activity"),
    search: (term: string, limit = 8) =>
        request<{ records: SearchHit[]; total: number }>(
            `/api/v2/search?q=${encodeURIComponent(term)}&limit=${limit}&view=list`
        ),
    docs: (query = "") => {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        return collect<DocumentRecord>("/api/v2/docs", params);
    },
    document: (id: string) =>
        request<{ record: DocumentRecord }>(
            `/api/v2/docs/${encodeURIComponent(id)}`
        ),
    changelog: (
        query = "",
        options: { state?: string; visibility?: string } = {}
    ) => {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (options.state) params.set("state", options.state);
        if (options.visibility) params.set("visibility", options.visibility);
        return collect<HistoryRecord>("/api/v2/changelog", params);
    },
    patchDocument: (
        id: string,
        changes: Record<string, unknown>,
        revision?: string
    ) =>
        request<{ record: DocumentRecord }>(
            `/api/v2/docs/${encodeURIComponent(id)}`,
            {
                method: "PATCH",
                headers: revision ? { "If-Match": `"${revision}"` } : undefined,
                body: JSON.stringify({ changes })
            }
        ),
    createChange: (input: Record<string, unknown>) =>
        request<{ record: ChangeRecord }>("/api/v2/changelog", {
            method: "POST",
            body: JSON.stringify(input)
        }),
    patchChange: (
        id: string,
        changes: Record<string, unknown>,
        revision?: string
    ) =>
        request<{ record: ChangeRecord }>(
            `/api/v2/changelog/${encodeURIComponent(id)}`,
            {
                method: "PATCH",
                headers: revision ? { "If-Match": `"${revision}"` } : undefined,
                body: JSON.stringify({ changes })
            }
        ),
    releasePreview: (input: Record<string, unknown> = {}) =>
        request<ReleasePreview>("/api/v2/changelog/releases/preview", {
            method: "POST",
            body: JSON.stringify(input)
        }),
    createRelease: (input: Record<string, unknown>) =>
        request<{ record: ReleaseRecord; fragments: ChangeRecord[] }>(
            "/api/v2/changelog/releases",
            { method: "POST", body: JSON.stringify(input) }
        ),
    renderedChangelog: (visibility = "public") =>
        request<{ visibility: string; content: string }>(
            `/api/v2/changelog/render?visibility=${encodeURIComponent(visibility)}`
        ),
    memory: (
        query = "",
        options: { collection?: string; status?: string } = {}
    ) => {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (options.collection) params.set("collection", options.collection);
        if (options.status) params.set("status", options.status);
        return collect<MemoryRecord>("/api/v2/memory", params);
    },
    createMemory: (input: Record<string, unknown>) =>
        request<{ record: MemoryRecord }>("/api/v2/memory", {
            method: "POST",
            body: JSON.stringify(input)
        }),
    patchMemory: (
        id: string,
        changes: Record<string, unknown>,
        revision?: string
    ) =>
        request<{ record: MemoryRecord }>(
            `/api/v2/memory/${encodeURIComponent(id)}`,
            {
                method: "PATCH",
                headers: revision ? { "If-Match": `"${revision}"` } : undefined,
                body: JSON.stringify({ changes })
            }
        ),
    graduateMemory: (id: string, targets: string[], revision?: string) =>
        request<{ record: MemoryRecord }>(
            `/api/v2/memory/${encodeURIComponent(id)}/graduate`,
            {
                method: "POST",
                headers: revision ? { "If-Match": `"${revision}"` } : undefined,
                body: JSON.stringify({ targets })
            }
        ),
    supersedeMemory: (
        id: string,
        replacementId: string,
        revision?: string
    ) =>
        request<{ record: MemoryRecord }>(
            `/api/v2/memory/${encodeURIComponent(id)}/supersede`,
            {
                method: "POST",
                headers: revision ? { "If-Match": `"${revision}"` } : undefined,
                body: JSON.stringify({ replacementId })
            }
        ),
    patch: (id: string, changes: TaskPatch, revision?: string) =>
        request<{ ok: true; task: import("./types").Task }>(`/api/tasks/${id}`, {
            method: "PATCH",
            headers: revision ? { "If-Match": `"${revision}"` } : undefined,
            body: JSON.stringify(changes)
        }),
    bulkPatch: (
        ids: string[],
        changes: TaskPatch,
        expectedRevisions?: Record<string, string>
    ) =>
        request<{
            ok: boolean;
            updated: number;
            failed: number;
            results: Array<{
                id: string;
                ok: boolean;
                revision?: string;
                error?: { code: string; message: string };
            }>;
        }>("/api/tasks/bulk", {
            method: "POST",
            body: JSON.stringify({ ids, changes, expectedRevisions })
        }),
    create: (input: Record<string, unknown>) =>
        request<{ id: string; file: string; revision?: string }>("/api/tasks", {
            method: "POST",
            body: JSON.stringify(input)
        }),
    archive: (id: string, archived: boolean, revision?: string) =>
        request<{ ok: true }>(
            `/api/tasks/${id}/${archived ? "unarchive" : "archive"}`,
            {
                method: "POST",
                headers: revision
                    ? { "If-Match": `"${revision}"` }
                    : undefined
            }
        ),
    upload: async (id: string, file: File) => {
        const response = await fetch(
            `/api/tasks/${id}/assets?name=${encodeURIComponent(file.name)}`,
            {
                method: "POST",
                // Declared explicitly so the upload is not a CORS "simple
                // request": the server refuses those on mutating routes. The
                // asset's real type is derived from its extension on read, so
                // nothing is lost by sending an opaque one here.
                headers: { "Content-Type": "application/octet-stream" },
                body: file
            }
        );
        if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as {
                error?: string | { message?: string };
            };
            const message =
                typeof payload.error === "string"
                    ? payload.error
                    : payload.error?.message;
            throw new Error(message || `Unable to upload ${file.name}`);
        }
    }
};
