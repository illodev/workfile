import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCheck, PanelRight, RotateCcw } from "lucide-react";

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
            <div
                style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    padding: 40
                }}
            >
                <CheckCheck
                    aria-hidden="true"
                    size={20}
                    style={{ color: statusColor("done") }}
                />
                <strong style={{ fontSize: 14 }}>Queue clear</strong>
                <span className="dim" style={{ fontSize: 12.5 }}>
                    You processed {processed.size.toLocaleString()} cards.
                </span>
                <button
                    type="button"
                    className="btn"
                    onClick={() => {
                        setProcessed(new Set());
                        setIndex(0);
                    }}
                >
                    <RotateCcw aria-hidden="true" />
                    Start again
                </button>
            </div>
        );

    return (
        <div
            style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                overflowY: "auto"
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    borderBottom: "1px solid var(--line)",
                    background: "var(--surface)"
                }}
            >
                <span className="meter" style={{ flex: 1, maxWidth: 340 }}>
                    <span
                        className="meter-fill"
                        style={{
                            width: `${
                                originalTotal
                                    ? (processed.size / originalTotal) * 100
                                    : 0
                            }%`
                        }}
                    />
                </span>
                <span className="mono dim" style={{ fontSize: 11 }}>
                    {processed.size} of {originalTotal} processed
                </span>
                <span style={{ flex: 1 }} />
                <button
                    type="button"
                    className="btn"
                    disabled={index === 0}
                    onClick={() =>
                        setIndex((current) => Math.max(0, current - 1))
                    }
                >
                    <span className="kbd">K</span>
                    Previous
                </button>
                <span
                    className="mono dim"
                    style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
                >
                    {index + 1} / {queue.length}
                </span>
                <button
                    type="button"
                    className="btn"
                    disabled={index >= queue.length - 1}
                    onClick={() =>
                        setIndex((current) =>
                            Math.min(queue.length - 1, current + 1)
                        )
                    }
                >
                    <span className="kbd">J</span>
                    Next
                </button>
                <button
                    type="button"
                    className="btn"
                    onClick={() => onOpen(task.id)}
                >
                    <PanelRight aria-hidden="true" />
                    Open full card
                </button>
            </div>

            <div style={{ padding: "28px 34px", maxWidth: 820 }}>
                <div
                    className="mono dim"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        fontSize: 11
                    }}
                >
                    <span>{task.id}</span>
                    <span className="faint">·</span>
                    <span style={{ color: statusColor(task.status) }}>
                        {task.status}
                    </span>
                    <span className="faint">·</span>
                    <span>{task.area}</span>
                    <span className="faint">·</span>
                    <span>{task.type}</span>
                </div>
                <h2
                    style={{
                        margin: "12px 0 4px",
                        fontSize: 26,
                        lineHeight: 1.2,
                        fontWeight: 600,
                        letterSpacing: "-0.02em",
                        textWrap: "pretty"
                    }}
                >
                    {task.title}
                </h2>
                {task.file ? (
                    <a
                        className="mono faint"
                        style={{
                            fontSize: 11,
                            textDecoration: "underline",
                            textUnderlineOffset: 3
                        }}
                        href={fileHref(task.file)}
                        target={repoUrl ? "_blank" : undefined}
                        rel={repoUrl ? "noreferrer" : undefined}
                    >
                        {task.file}
                    </a>
                ) : null}
                {task.source ? (
                    <span
                        className="mono faint"
                        style={{ display: "block", fontSize: 11, marginTop: 3 }}
                    >
                        source{" "}
                        <a
                            className="mono faint"
                            style={{
                                textDecoration: "underline",
                                textUnderlineOffset: 3
                            }}
                            href={fileHref(task.source)}
                            target={repoUrl ? "_blank" : undefined}
                            rel={repoUrl ? "noreferrer" : undefined}
                        >
                            {task.source}
                        </a>
                    </span>
                ) : null}
                <div style={{ marginTop: 22 }}>
                    <MarkdownBody source={task.body} onOpen={onOpen} />
                </div>

                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 30,
                        paddingTop: 18,
                        borderTop: "1px solid var(--line)",
                        flexWrap: "wrap"
                    }}
                >
                    {PRIORITIES.map((priority, priorityIndex) => (
                        <button
                            key={priority}
                            type="button"
                            className="btn"
                            aria-pressed={task.priority === priority}
                            style={
                                task.priority === priority
                                    ? { borderColor: priorityColor(priority) }
                                    : undefined
                            }
                            onClick={() => void apply({ priority }, false)}
                        >
                            <span className="kbd">{priorityIndex + 1}</span>
                            <span style={{ color: priorityColor(priority) }}>
                                {priority}
                            </span>
                        </button>
                    ))}
                    {ACTIONS.map((action) => (
                        <button
                            key={action.key}
                            type="button"
                            className="btn"
                            onClick={() => void apply({ status: action.status })}
                        >
                            <span className="kbd">{action.key}</span>
                            <span style={{ color: statusColor(action.status) }}>
                                {action.label}
                            </span>
                        </button>
                    ))}
                </div>
                <span
                    className="faint"
                    style={{ display: "block", marginTop: 14, fontSize: 12 }}
                >
                    Every action writes the card&apos;s frontmatter to disk
                    immediately. Shortcuts work while focus is outside a form.
                </span>
            </div>
        </div>
    );
}
