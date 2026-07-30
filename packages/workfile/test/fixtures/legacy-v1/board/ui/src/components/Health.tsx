import { useEffect, useState } from "react";

import { api } from "../api";
import type { HealthReport, IssueSeverity } from "../types";

export function HealthView({ onOpen }: { onOpen: (id: string) => void }) {
    const [report, setReport] = useState<HealthReport | null>(null);
    const [error, setError] = useState("");
    const [severity, setSeverity] = useState<"" | IssueSeverity>("");

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
    }, []);

    if (error)
        return (
            <main className="health-view">
                <div className="notice notice-error">{error}</div>
            </main>
        );
    if (!report)
        return (
            <main className="health-view">
                <div className="loading">Running backlog doctor…</div>
            </main>
        );

    const issues = severity
        ? report.issues.filter((issue) => issue.severity === severity)
        : report.issues;
    return (
        <main className="health-view">
            <header className="health-header">
                <div>
                    <h2>Backlog health</h2>
                    <p>
                        Checked {report.cards.toLocaleString()} cards at{" "}
                        {new Intl.DateTimeFormat(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short"
                        }).format(new Date(report.generatedAt))}
                    </p>
                </div>
                <code>pnpm backlog:doctor</code>
            </header>
            <div className="health-summary">
                {(["error", "warning", "info"] as const).map((level) => (
                    <button
                        type="button"
                        key={level}
                        className={`health-stat severity-${level} ${
                            severity === level ? "is-active" : ""
                        }`}
                        onClick={() =>
                            setSeverity((current) =>
                                current === level ? "" : level
                            )
                        }
                    >
                        <strong>{report.counts[level]}</strong>
                        <span>{level}s</span>
                    </button>
                ))}
            </div>
            {issues.length === 0 ? (
                <div className="health-ok">
                    ✓ No {severity || "integrity"} issues found.
                </div>
            ) : (
                <div className="health-issues">
                    {issues.map((issue, index) => (
                        <button
                            type="button"
                            className="health-issue"
                            key={`${issue.id || issue.file}-${issue.code}-${index}`}
                            onClick={() => {
                                if (issue.id) onOpen(issue.id);
                            }}
                            disabled={!issue.id}
                        >
                            <span
                                className={`severity-badge severity-${issue.severity}`}
                            >
                                {issue.severity}
                            </span>
                            <span className="mono">
                                {issue.id || issue.file}
                            </span>
                            <span>{issue.message}</span>
                            <code>{issue.code}</code>
                        </button>
                    ))}
                </div>
            )}
        </main>
    );
}
