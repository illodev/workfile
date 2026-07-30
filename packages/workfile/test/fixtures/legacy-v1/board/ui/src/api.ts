import type {
    HealthReport,
    KnowledgeDocument,
    KnowledgeIndex,
    KnowledgeKind,
    TaskPatch,
    TaskResponse
} from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        cache: "no-store",
        ...init,
        headers: {
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
            ...init?.headers
        }
    });
    if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
        };
        throw new Error(payload.error || `Request failed (${response.status})`);
    }
    return (await response.json()) as T;
}

export const api = {
    tasks: () => request<TaskResponse>("/api/tasks"),
    health: () => request<HealthReport>("/api/health"),
    knowledge: () => request<KnowledgeIndex>("/api/knowledge"),
    knowledgeDocument: (kind: KnowledgeKind, path: string) =>
        request<KnowledgeDocument>(
            `/api/knowledge/document?kind=${kind}&path=${encodeURIComponent(path)}`
        ),
    patch: (id: string, changes: TaskPatch) =>
        request<{ ok: true }>(`/api/tasks/${id}`, {
            method: "PATCH",
            body: JSON.stringify(changes)
        }),
    bulkPatch: (ids: string[], changes: TaskPatch) =>
        request<{ ok: true; updated: number }>("/api/tasks/bulk", {
            method: "POST",
            body: JSON.stringify({ ids, changes })
        }),
    create: (input: Record<string, unknown>) =>
        request<{ id: string; file: string }>("/api/tasks", {
            method: "POST",
            body: JSON.stringify(input)
        }),
    archive: (id: string, archived: boolean) =>
        request<{ ok: true }>(
            `/api/tasks/${id}/${archived ? "unarchive" : "archive"}`,
            { method: "POST" }
        ),
    upload: async (id: string, file: File) => {
        const response = await fetch(
            `/api/tasks/${id}/assets?name=${encodeURIComponent(file.name)}`,
            { method: "POST", body: file }
        );
        if (!response.ok) throw new Error(`Unable to upload ${file.name}`);
    }
};
