import { MEMORY_DEFINITIONS } from "../../config/defaults.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CONFIDENCE = new Set(["low", "medium", "high"]);
const SEVERITIES = new Set(["critical", "high", "medium", "low"]);

function issue(severity, code, record, message, details = undefined) {
    return {
        severity,
        code,
        id: record?.id,
        file: record?.path,
        message,
        ...(details ? { details } : {})
    };
}

function supersessionCycles(records) {
    const byId = new Map(records.map((record) => [record.id, record]));
    const cycles = [];
    for (const record of records) {
        const visiting = new Set();
        let current = record;
        while (current) {
            if (visiting.has(current.id)) {
                cycles.push([...visiting, current.id]);
                break;
            }
            visiting.add(current.id);
            const next = current.superseded_by?.[0];
            current = next ? byId.get(next) : null;
        }
    }
    return cycles;
}

export function diagnoseMemory({
    records,
    unreadable = [],
    workspace,
    knownRecords = new Map(),
    now = new Date()
}) {
    const issues = unreadable.map((entry) =>
        issue(
            "error",
            "unreadable-memory-record",
            { path: entry.file },
            `Cannot read memory record: ${entry.reason}`
        )
    );
    const ids = new Map();
    for (const record of records) {
        if (!ids.has(record.id)) ids.set(record.id, []);
        ids.get(record.id).push(record);
    }
    for (const [id, matches] of ids) {
        if (matches.length > 1) {
            issues.push(
                issue(
                    "error",
                    "duplicate-record-id",
                    matches[0],
                    `${id} appears in ${matches.length} memory files`
                )
            );
        }
    }
    const today = now.toISOString().slice(0, 10);
    for (const record of records) {
        const definition = MEMORY_DEFINITIONS[record.collection];
        for (const key of ["id", "title", "status", "created", "updated"]) {
            if (!record[key]) {
                issues.push(
                    issue(
                        "error",
                        "memory-missing-required",
                        record,
                        `Missing required field: ${key}`
                    )
                );
            }
        }
        if (!definition) {
            issues.push(
                issue(
                    "error",
                    "memory-invalid-collection",
                    record,
                    `Unknown memory collection: ${record.collection}`
                )
            );
            continue;
        }
        if (!definition.statuses.includes(record.status)) {
            issues.push(
                issue(
                    "error",
                    "memory-invalid-status",
                    record,
                    `Invalid ${record.collection} status: ${record.status}`
                )
            );
        }
        for (const key of ["created", "updated", "expires", "review_after"]) {
            if (record[key] && !DATE_RE.test(record[key])) {
                issues.push(
                    issue(
                        "error",
                        "memory-invalid-date",
                        record,
                        `${key} must use YYYY-MM-DD`
                    )
                );
            }
        }
        for (const reference of [
            ...(record.related || []),
            ...(record.supersedes || []),
            ...(record.superseded_by || []),
            ...(record.graduated_to || []),
            ...(record.corrective_actions || [])
        ]) {
            if (!knownRecords.has(reference)) {
                issues.push(
                    issue(
                        "warning",
                        "memory-missing-reference",
                        record,
                        `Referenced record does not exist: ${reference}`
                    )
                );
            }
        }
        if (
            record.status === "superseded" &&
            !(record.superseded_by?.length || record.supersedes?.length)
        ) {
            issues.push(
                issue(
                    "warning",
                    "memory-supersession-target-missing",
                    record,
                    "Superseded record does not identify its replacement"
                )
            );
        }
        if (record.collection === "learnings") {
            if (record.confidence && !CONFIDENCE.has(record.confidence)) {
                issues.push(
                    issue(
                        "error",
                        "learning-invalid-confidence",
                        record,
                        `Invalid confidence: ${record.confidence}`
                    )
                );
            }
            if (
                record.occurrences != null &&
                (!Number.isInteger(record.occurrences) || record.occurrences < 1)
            ) {
                issues.push(
                    issue(
                        "error",
                        "learning-invalid-occurrences",
                        record,
                        "occurrences must be a positive integer"
                    )
                );
            }
            if (record.status === "graduated" && !record.graduated_to?.length) {
                issues.push(
                    issue(
                        "warning",
                        "learning-graduation-target-missing",
                        record,
                        "Graduated learning does not link to a stronger artifact"
                    )
                );
            }
        }
        if (record.collection === "incidents") {
            if (record.severity && !SEVERITIES.has(record.severity)) {
                issues.push(
                    issue(
                        "error",
                        "incident-invalid-severity",
                        record,
                        `Invalid incident severity: ${record.severity}`
                    )
                );
            }
            for (const key of ["started_at", "resolved_at"]) {
                if (record[key] && !Number.isFinite(Date.parse(record[key]))) {
                    issues.push(
                        issue(
                            "error",
                            "incident-invalid-timestamp",
                            record,
                            `${key} must be an ISO-8601 timestamp`
                        )
                    );
                }
            }
            if (
                ["resolved", "closed"].includes(record.status) &&
                !record.resolved_at
            ) {
                issues.push(
                    issue(
                        "warning",
                        "incident-resolution-time-missing",
                        record,
                        "Resolved incident does not include resolved_at"
                    )
                );
            }
            if (
                ["resolved", "closed"].includes(record.status) &&
                !record.corrective_actions?.length
            ) {
                issues.push(
                    issue(
                        "info",
                        "incident-corrective-actions-missing",
                        record,
                        "Resolved incident does not link corrective actions"
                    )
                );
            }
        }
        if (record.collection === "context") {
            if (
                record.status === "active" &&
                !record.expires &&
                !record.review_after
            ) {
                issues.push(
                    issue(
                        "warning",
                        "context-lifecycle-missing",
                        record,
                        "Active context should define expires or review_after"
                    )
                );
            }
            if (record.status === "active" && record.expires && record.expires < today) {
                issues.push(
                    issue(
                        "warning",
                        "context-expired-active",
                        record,
                        `Context expired on ${record.expires} but remains active`
                    )
                );
            }
            if (
                record.status === "active" &&
                record.review_after &&
                record.review_after < today
            ) {
                issues.push(
                    issue(
                        "warning",
                        "context-review-overdue",
                        record,
                        `Context review was due on ${record.review_after}`
                    )
                );
            }
        }
    }
    const seenCycles = new Set();
    for (const cycle of supersessionCycles(records)) {
        const normalized = [...new Set(cycle)].sort().join("|");
        if (seenCycles.has(normalized)) continue;
        seenCycles.add(normalized);
        const first = knownRecords.get(cycle[0]);
        issues.push(
            issue(
                "error",
                "memory-supersession-cycle",
                first || { id: cycle[0] },
                `Supersession cycle detected: ${cycle.join(" → ")}`
            )
        );
    }
    const counts = { error: 0, warning: 0, info: 0 };
    for (const item of issues) counts[item.severity] += 1;
    return {
        generatedAt: now.toISOString(),
        records: records.length,
        collections: Object.fromEntries(
            workspace.config.memory.collections.map((collection) => [
                collection,
                records.filter((record) => record.collection === collection).length
            ])
        ),
        counts,
        ok: counts.error === 0,
        issues
    };
}
