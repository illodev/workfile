import { useEffect, useMemo, useState } from "react";
import { CircleCheck } from "lucide-react";

import { api } from "../api";
import { useWorkspaceChanges } from "../store/live";
import { severityColor, statusColor } from "../theme";
import type { HealthIssue, HealthReport, IssueSeverity } from "../types";

/**
 * Doctor severities, matching the three levels `runDoctor` actually emits.
 * Each tile hints at what its level means for the workspace; a clean error
 * tile borrows the "done" green because zero errors is the healthy state.
 */
const LEVELS: Array<{
    level: IssueSeverity;
    label: string;
    hint: string;
    zeroHint: string;
}> = [
    {
        level: "error",
        label: "errors",
        hint: "must be fixed for a consistent workspace",
        zeroHint: "the doctor does not block the release"
    },
    {
        level: "warning",
        label: "warnings",
        hint: "worth a look, nothing is broken yet",
        zeroHint: "nothing worth flagging"
    },
    {
        level: "info",
        label: "infos",
        hint: "informational, no action required",
        zeroHint: "no notices from the doctor"
    }
];

/** "duplicate-record-id" → "duplicate record id", for the group header. */
function summarize(code: string): string {
    return code.replace(/[-_.]+/g, " ");
}

const SEVERITY_RANK: Record<IssueSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2
};

export function HealthView({ onOpen }: { onOpen: (id: string) => void }) {
    const [report, setReport] = useState<HealthReport | null>(null);
    const [error, setError] = useState("");
    const [severity, setSeverity] = useState<"" | IssueSeverity>("");
    // Any record can change the report, so this one listens to everything.
    const [reloadKey, setReloadKey] = useState(0);
    useWorkspaceChanges(() => setReloadKey((key) => key + 1));

    useEffect(() => {
        let active = true;
        void api
            .health()
            .then((result) => {
                if (active) setReport(result);
            })
            .catch((reason: unknown) => {
                if (active)
                    setError(
                        reason instanceof Error
                            ? reason.message
                            : String(reason)
                    );
            });
        return () => {
            active = false;
        };
    }, [reloadKey]);

    const groups = useMemo(() => {
        if (!report) return [];
        const issues = severity
            ? report.issues.filter((issue) => issue.severity === severity)
            : report.issues;
        const byCode = new Map<string, HealthIssue[]>();
        for (const issue of issues) {
            const bucket = byCode.get(issue.code);
            if (bucket) bucket.push(issue);
            else byCode.set(issue.code, [issue]);
        }
        // Errors first, then alphabetical: the reading order is the fix order.
        return [...byCode.entries()].sort(([codeA, [firstA]], [codeB, [firstB]]) => {
            const rank =
                SEVERITY_RANK[firstA.severity] - SEVERITY_RANK[firstB.severity];
            return rank !== 0 ? rank : codeA.localeCompare(codeB);
        });
    }, [report, severity]);

    if (error)
        return (
            <div className="callout callout-error" role="alert">
                {error}
            </div>
        );
    if (!report)
        return (
            <div style={{ padding: 14 }} aria-busy="true">
                <span className="mono faint" style={{ fontSize: 11 }}>
                    running workfile doctor…
                </span>
            </div>
        );

    const moduleCounts = (
        [
            ["cards", report.modules?.cards ?? report.cards],
            ["docs", report.modules?.docs],
            ["memory", report.modules?.memory],
            ["changelog", report.modules?.changelog]
        ] as const
    )
        .filter(([, value]) => value != null)
        .map(([label, value]) => `${(value as number).toLocaleString()} ${label}`)
        .join(", ");
    const checkedAt = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(new Date(report.generatedAt));

    return (
        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {LEVELS.map(({ level, label }) => (
                    <button
                        key={level}
                        type="button"
                        className={severity === level ? "chip is-on" : "chip"}
                        aria-pressed={severity === level}
                        onClick={() =>
                            setSeverity((current) =>
                                current === level ? "" : level
                            )
                        }
                    >
                        {label}
                        <span className="chip-value">
                            {report.counts[level]}
                        </span>
                    </button>
                ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
                {LEVELS.map(({ level, label, hint, zeroHint }) => {
                    const count = report.counts[level];
                    const color =
                        level === "error" && count === 0
                            ? statusColor("done")
                            : severityColor(level);
                    return (
                        <div
                            key={level}
                            className="panel"
                            style={{
                                flex: 1,
                                gap: 4,
                                padding: "13px 14px",
                                borderLeft: `2px solid ${color}`
                            }}
                        >
                            <span
                                style={{
                                    display: "flex",
                                    alignItems: "baseline",
                                    gap: 8
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: 26,
                                        fontWeight: 600,
                                        letterSpacing: "-0.02em",
                                        color
                                    }}
                                >
                                    {count}
                                </span>
                                <span
                                    className="mono dim"
                                    style={{ fontSize: 11 }}
                                >
                                    {label}
                                </span>
                            </span>
                            <span className="faint" style={{ fontSize: 12 }}>
                                {count === 0 ? zeroHint : hint}
                            </span>
                        </div>
                    );
                })}
            </div>

            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "16px 2px 8px"
                }}
            >
                <span className="mono dim" style={{ fontSize: 11 }}>
                    grouped by code · {moduleCounts} · checked {checkedAt}
                </span>
                <span style={{ flex: 1 }} />
                <span className="mono faint" style={{ fontSize: 10.5 }}>
                    workfile doctor --json
                </span>
            </div>

            {groups.length === 0 ? (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                        padding: "40px 0"
                    }}
                >
                    <CircleCheck
                        aria-hidden="true"
                        size={20}
                        style={{ color: statusColor("done") }}
                    />
                    <strong style={{ fontSize: 14 }}>All clear</strong>
                    <span className="dim" style={{ fontSize: 12.5 }}>
                        No {severity || "integrity"} issues found.
                    </span>
                </div>
            ) : (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8
                    }}
                >
                    {groups.map(([code, issues]) => (
                        <div
                            key={code}
                            className="panel"
                            style={{ overflow: "hidden" }}
                        >
                            <div className="panel-head" style={{ gap: 9 }}>
                                <span
                                    className="dot"
                                    aria-hidden="true"
                                    style={{
                                        width: 7,
                                        height: 7,
                                        color: severityColor(
                                            issues[0].severity
                                        )
                                    }}
                                />
                                <span
                                    className="mono"
                                    style={{ fontSize: 11.5 }}
                                >
                                    {code}
                                </span>
                                <span
                                    className="dim"
                                    style={{ flex: 1, fontSize: 12.5 }}
                                >
                                    {summarize(code)}
                                </span>
                                <span
                                    className="mono faint"
                                    style={{ fontSize: 11 }}
                                >
                                    {issues.length}
                                </span>
                            </div>
                            {issues.map((issue, issueIndex) => (
                                <div
                                    key={`${issue.id || issue.file}-${issueIndex}`}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                        padding: "7px 12px",
                                        borderBottom:
                                            "1px solid var(--line-2)"
                                    }}
                                >
                                    {issue.id ? (
                                        <button
                                            type="button"
                                            className="mono"
                                            style={{
                                                flex: "0 0 82px",
                                                width: 82,
                                                padding: 0,
                                                border: 0,
                                                background: "none",
                                                textAlign: "left",
                                                fontSize: 11,
                                                color: "var(--accent)",
                                                cursor: "pointer"
                                            }}
                                            onClick={() => onOpen(issue.id!)}
                                        >
                                            {issue.id}
                                        </button>
                                    ) : (
                                        <span
                                            className="mono faint"
                                            style={{
                                                flex: "0 0 82px",
                                                width: 82,
                                                fontSize: 11
                                            }}
                                        >
                                            —
                                        </span>
                                    )}
                                    <span
                                        className="dim"
                                        style={{ flex: 1, fontSize: 12.5 }}
                                    >
                                        {issue.message}
                                    </span>
                                    {issue.file ? (
                                        <span
                                            className="mono faint truncate"
                                            style={{
                                                fontSize: 10.5,
                                                maxWidth: 320
                                            }}
                                            title={issue.file}
                                        >
                                            {issue.file}
                                        </span>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
