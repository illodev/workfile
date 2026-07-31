import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCheck, PanelRight, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle
} from "@/components/ui/empty";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

import { READING_MEASURE } from "../layout";
import { PRIORITIES, type Priority, type Status, type Task } from "../types";
import { MarkdownBody } from "./Markdown";
import { priorityColor, statusColor } from "../theme";

const ACTIONS: Array<{ key: string; label: string; status: Status }> = [
    { key: "N", label: "Move to next", status: "next" },
    { key: "D", label: "Defer", status: "deferred" },
    { key: "X", label: "Discard", status: "discarded" }
];

export function TriageView({
    tasks,
    repoRoot,
    repoUrl,
    onPatch,
    onOpen
}: {
    tasks: Task[];
    repoRoot: string;
    repoUrl?: string;
    onPatch: (
        id: string,
        changes: { status?: Status; priority?: Priority }
    ) => Promise<void>;
    onOpen: (id: string) => void;
}) {
    const [processed, setProcessed] = useState<Set<string>>(() => new Set());
    const [index, setIndex] = useState(0);
    const queue = useMemo(
        () => tasks.filter((task) => !processed.has(task.id)),
        [processed, tasks]
    );
    const task = queue[index] || queue[0];
    const originalTotal = tasks.length;

    useEffect(() => {
        if (index >= queue.length) setIndex(Math.max(0, queue.length - 1));
    }, [index, queue.length]);

    const apply = useCallback(
        async (
            changes: { status?: Status; priority?: Priority },
            complete = true
        ) => {
            if (!task) return;
            try {
                await onPatch(task.id, changes);
            } catch {
                return;
            }
            if (!complete) return;
            setProcessed((current) => new Set(current).add(task.id));
            setIndex((current) =>
                Math.min(current, Math.max(0, queue.length - 2))
            );
        },
        [onPatch, queue.length, task]
    );

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            // A modified key belongs to the browser, not to us. Without this,
            // Ctrl+1..4 — universal muscle memory for switching tabs — wrote a
            // priority to the card's Markdown file with no confirmation and no
            // undo, and Ctrl+J / Ctrl+K were swallowed too.
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            const target = event.target as HTMLElement;
            if (
                ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) ||
                target.isContentEditable
            ) {
                return;
            }
            const key = event.key.toUpperCase();
            if (key === "J" || event.key === "ArrowDown") {
                event.preventDefault();
                setIndex((current) => Math.min(queue.length - 1, current + 1));
            } else if (key === "K" || event.key === "ArrowUp") {
                event.preventDefault();
                setIndex((current) => Math.max(0, current - 1));
            } else if (/^[1-4]$/.test(key)) {
                event.preventDefault();
                void apply({ priority: PRIORITIES[Number(key) - 1] }, false);
            } else {
                const action = ACTIONS.find(
                    (candidate) => candidate.key === key
                );
                if (action) {
                    event.preventDefault();
                    void apply({ status: action.status });
                }
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [apply, queue.length]);

    // The demo dataset ships records with an empty `file`; the link only
    // renders when there is a path to open.
    const fileHref = (path: string) =>
        repoUrl
            ? `${repoUrl.replace(/\/+$/, "")}/blob/main/${path}`
            : `vscode://file${repoRoot}/${path}`;

    if (!task)
        return (
            <Empty className="gap-3 p-10">
                <EmptyHeader>
                    <EmptyMedia>
                        <CheckCheck
                            aria-hidden="true"
                            size={20}
                            style={{ color: statusColor("done") }}
                        />
                    </EmptyMedia>
                    <EmptyTitle className="text-sm">Queue clear</EmptyTitle>
                    <EmptyDescription className="text-[12.5px]">
                        You processed {processed.size.toLocaleString()} cards.
                    </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            setProcessed(new Set());
                            setIndex(0);
                        }}
                    >
                        <RotateCcw aria-hidden="true" />
                        Start again
                    </Button>
                </EmptyContent>
            </Empty>
        );

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="flex items-center gap-2.5 border-b bg-card px-3.5 py-2.5">
                <Progress
                    value={
                        originalTotal
                            ? (processed.size / originalTotal) * 100
                            : 0
                    }
                    className="max-w-[340px] flex-1"
                />
                <span className="font-mono text-[11px] text-muted-foreground">
                    {processed.size} of {originalTotal} processed
                </span>
                <span className="flex-1" />
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={index === 0}
                    onClick={() =>
                        setIndex((current) => Math.max(0, current - 1))
                    }
                >
                    <Kbd>K</Kbd>
                    Previous
                </Button>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {index + 1} / {queue.length}
                </span>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={index >= queue.length - 1}
                    onClick={() =>
                        setIndex((current) =>
                            Math.min(queue.length - 1, current + 1)
                        )
                    }
                >
                    <Kbd>J</Kbd>
                    Next
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onOpen(task.id)}
                >
                    <PanelRight aria-hidden="true" />
                    Open full card
                </Button>
            </div>

            <div className={cn(READING_MEASURE, "px-6 py-7 sm:px-8")}>
                <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                    <span>{task.id}</span>
                    <span className="text-muted-foreground/60">·</span>
                    <span style={{ color: statusColor(task.status) }}>
                        {task.status}
                    </span>
                    <span className="text-muted-foreground/60">·</span>
                    <span>{task.area}</span>
                    <span className="text-muted-foreground/60">·</span>
                    <span>{task.type}</span>
                </div>
                <h2 className="mt-3 mb-1 text-[26px] leading-[1.2] font-semibold tracking-tight [text-wrap:pretty]">
                    {task.title}
                </h2>
                {task.file ? (
                    <a
                        className="font-mono text-[11px] text-muted-foreground/70 underline underline-offset-[3px]"
                        href={fileHref(task.file)}
                        target={repoUrl ? "_blank" : undefined}
                        rel={repoUrl ? "noreferrer" : undefined}
                    >
                        {task.file}
                    </a>
                ) : null}
                {task.source ? (
                    <span className="mt-[3px] block font-mono text-[11px] text-muted-foreground/70">
                        source{" "}
                        <a
                            className="font-mono underline underline-offset-[3px]"
                            href={fileHref(task.source)}
                            target={repoUrl ? "_blank" : undefined}
                            rel={repoUrl ? "noreferrer" : undefined}
                        >
                            {task.source}
                        </a>
                    </span>
                ) : null}
                <div className="mt-[22px]">
                    <MarkdownBody source={task.body} onOpen={onOpen} />
                </div>

                <div className="mt-[30px] flex flex-wrap gap-2 border-t pt-[18px]">
                    {PRIORITIES.map((priority, priorityIndex) => (
                        <Button
                            key={priority}
                            type="button"
                            variant="outline"
                            aria-pressed={task.priority === priority}
                            style={
                                task.priority === priority
                                    ? { borderColor: priorityColor(priority) }
                                    : undefined
                            }
                            onClick={() => void apply({ priority }, false)}
                        >
                            <Kbd>{priorityIndex + 1}</Kbd>
                            <span style={{ color: priorityColor(priority) }}>
                                {priority}
                            </span>
                        </Button>
                    ))}
                    {ACTIONS.map((action) => (
                        <Button
                            key={action.key}
                            type="button"
                            variant="outline"
                            onClick={() => void apply({ status: action.status })}
                        >
                            <Kbd>{action.key}</Kbd>
                            <span style={{ color: statusColor(action.status) }}>
                                {action.label}
                            </span>
                        </Button>
                    ))}
                </div>
                <span className="mt-3.5 block text-xs text-muted-foreground">
                    Every action writes the card&apos;s frontmatter to disk
                    immediately. Shortcuts work while focus is outside a form.
                </span>
            </div>
        </div>
    );
}
