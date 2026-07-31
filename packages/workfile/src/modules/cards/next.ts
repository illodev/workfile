const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const READY_STATUSES = new Set(["next", "backlog", "doing"]);

export const NEXT_DEFAULT_LIMIT = 5;
export const NEXT_MAXIMUM_LIMIT = 20;

/**
 * The cards worth picking up right now, with the reason attached.
 *
 * Ordering mirrors how a person would choose: work already claimed by this
 * actor first (finish what you started), then unblocked cards by priority.
 * Cards whose dependencies are unmet are excluded rather than ranked low —
 * offering one would waste a turn discovering it cannot be started.
 *
 * This lived inside the MCP tool module and was reachable from exactly one of
 * the three surfaces, so a session driving the CLI never met it and rebuilt the
 * sweep out of `search`. The ranking is the product; where it is called from is
 * not, so it sits here and both callers share it.
 */
export function rankNextCards(records, { actor = null, areas = null, limit = NEXT_DEFAULT_LIMIT } = {} as any) {
    const areaSet = areas?.length ? new Set(areas) : null;
    const byId = new Map<string, any>(records.map((record) => [record.id, record]));
    const satisfied = (id) => {
        const target = byId.get(id);
        return !target || target.status === "done" || target.status === "discarded";
    };
    const candidates = records
        .filter(
            (record) =>
                record.kind === "card" &&
                READY_STATUSES.has(record.status) &&
                record.recordType !== "epic" &&
                (!areaSet || areaSet.has(record.area)) &&
                (!record.claimed_by || record.claimed_by === actor) &&
                (record.depends || []).every(satisfied)
        )
        .map((record) => ({
            record,
            mine: Boolean(actor && record.claimed_by === actor),
            reason: [
                actor && record.claimed_by === actor ? "already claimed by you" : null,
                record.status === "doing" ? "in progress" : null,
                record.status === "next" ? "queued next" : null,
                (record.depends || []).length ? "dependencies met" : null,
                `priority ${record.priority}`
            ]
                .filter(Boolean)
                .join("; ")
        }))
        .sort(
            (left, right) =>
                Number(right.mine) - Number(left.mine) ||
                (left.record.status === "doing" ? 0 : 1) -
                    (right.record.status === "doing" ? 0 : 1) ||
                (PRIORITY_RANK[left.record.priority] ?? 9) -
                    (PRIORITY_RANK[right.record.priority] ?? 9) ||
                String(left.record.updated || "").localeCompare(
                    String(right.record.updated || "")
                )
        );
    return {
        candidates: candidates.slice(0, limit),
        total: candidates.length
    };
}
