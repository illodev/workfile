import { useEffect, useMemo, useState } from "react";
import { CircleCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

import { Accent } from "./Accent";
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
            <div className="p-3.5">
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            </div>
        );
    if (!report)
        return (
            <div className="flex items-center gap-2 p-3.5" aria-busy="true">
                <Spinner className="size-3 text-muted-foreground" />
                <span className="font-mono text-[11px] text-muted-foreground">
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
        <div className="flex-1 overflow-y-auto p-3.5">
            <div className="mb-2.5 flex gap-1.5">
                {LEVELS.map(({ level, label }) => (
                    <Button
                        key={level}
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-pressed={severity === level}
                        className="aria-pressed:border-ring aria-pressed:bg-accent"
                        onClick={() =>
                            setSeverity((current) =>
                                current === level ? "" : level
                            )
                        }
                    >
                        {label}
                        <Badge
                            variant="secondary"
                            className="px-1.5 font-mono text-[10.5px]"
                        >
                            {report.counts[level]}
                        </Badge>
                    </Button>
                ))}
            </div>

            <div className="flex flex-wrap gap-2.5">
                {LEVELS.map(({ level, label, hint, zeroHint }) => {
                    const count = report.counts[level];
                    const color =
                        level === "error" && count === 0
                            ? statusColor("done")
                            : severityColor(level);
                    return (
                        <Card
                            key={level}
                            className="relative min-w-[13rem] flex-1 gap-1 py-3 pl-5 pr-3.5"
                        >
                            <Accent edge="left" color={color} />
                            <span className="flex items-baseline gap-2">
                                <span
                                    className="text-[26px] font-semibold tracking-tight"
                                    style={{ color }}
                                >
                                    {count}
                                </span>
                                <span className="font-mono text-[11px] text-muted-foreground">
                                    {label}
                                </span>
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {count === 0 ? zeroHint : hint}
                            </span>
                        </Card>
                    );
                })}
            </div>

            {/* `ml-auto` over a flex-1 spacer, and the row wraps: on a phone
                the two mono strings collided and broke mid-word into a knot of
                three or four lines. Now the summary keeps its line and the
                command drops below it cleanly when there is no room. */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-0.5 pt-4 pb-2">
                <span className="font-mono text-[11px] text-muted-foreground">
                    grouped by code · {moduleCounts} · checked {checkedAt}
                </span>
                <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/70">
                    workfile doctor --json
                </span>
            </div>

            {groups.length === 0 ? (
                <Empty className="gap-2 p-10">
                    <EmptyHeader>
                        <EmptyMedia>
                            <CircleCheck
                                aria-hidden="true"
                                size={20}
                                style={{ color: statusColor("done") }}
                            />
                        </EmptyMedia>
                        <EmptyTitle className="text-sm">All clear</EmptyTitle>
                        <EmptyDescription className="text-[12.5px]">
                            No {severity || "integrity"} issues found.
                        </EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                <div className="flex flex-col gap-2">
                    {groups.map(([code, issues]) => (
                        <Card
                            key={code}
                            className="gap-0 overflow-hidden py-0"
                        >
                            <div className="flex items-center gap-2 border-b px-3 py-1.5">
                                <span
                                    aria-hidden="true"
                                    className="size-[7px] rounded-full bg-current"
                                    style={{
                                        color: severityColor(
                                            issues[0].severity
                                        )
                                    }}
                                />
                                <span className="font-mono text-[11.5px]">
                                    {code}
                                </span>
                                <span className="flex-1 text-[12.5px] text-muted-foreground">
                                    {summarize(code)}
                                </span>
                                <span className="font-mono text-[11px] text-muted-foreground/70">
                                    {issues.length}
                                </span>
                            </div>
                            {issues.map((issue, issueIndex) => (
                                <div
                                    key={`${issue.id || issue.file}-${issueIndex}`}
                                    className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b px-3 py-[7px] last:border-0"
                                >
                                    {issue.id ? (
                                        <Button
                                            type="button"
                                            variant="link"
                                            className="h-auto w-[82px] flex-[0_0_82px] justify-start p-0 font-mono text-[11px] font-normal"
                                            onClick={() => onOpen(issue.id!)}
                                        >
                                            {issue.id}
                                        </Button>
                                    ) : (
                                        <span className="w-[82px] flex-[0_0_82px] font-mono text-[11px] text-muted-foreground/70">
                                            —
                                        </span>
                                    )}
                                    <span className="min-w-[12rem] flex-1 text-[12.5px] text-muted-foreground">
                                        {issue.message}
                                    </span>
                                    {issue.file ? (
                                        <span
                                            className="max-w-full truncate font-mono text-[10.5px] text-muted-foreground/70 sm:max-w-80"
                                            title={issue.file}
                                        >
                                            {issue.file}
                                        </span>
                                    ) : null}
                                </div>
                            ))}
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
