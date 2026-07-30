import { useCallback, useEffect, useMemo, useState } from "react";

import { PRIORITIES, type Priority, type Status, type Task } from "../types";
import { MarkdownBody } from "./Drawer";

const ACTIONS: Array<{
    key: string;
    label: string;
    status: Status;
    className?: string;
}> = [
    { key: "N", label: "Move to next", status: "next" },
    { key: "D", label: "Defer", status: "deferred" },
    {
        key: "X",
        label: "Discard",
        status: "discarded",
        className: "button-danger"
    }
];

export function TriageView({
    tasks,
    repoRoot,
    onPatch,
    onOpen
}: {
    tasks: Task[];
    repoRoot: string;
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
            const target = event.target as HTMLElement;
            if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))
                return;
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

    if (!task)
        return (
            <main className="triage-complete">
                <h2>Queue complete</h2>
                <p>You processed {processed.size.toLocaleString()} cards.</p>
                <button
                    className="button"
                    type="button"
                    onClick={() => {
                        setProcessed(new Set());
                        setIndex(0);
                    }}
                >
                    Start again
                </button>
            </main>
        );

    return (
        <main className="triage-view">
            <header className="triage-header">
                <div>
                    <strong>Triage queue</strong>
                    <span>
                        {processed.size.toLocaleString()} processed ·{" "}
                        {queue.length.toLocaleString()} remaining ·{" "}
                        {originalTotal.toLocaleString()} initial
                    </span>
                </div>
                <div className="triage-navigation">
                    <button
                        className="button"
                        type="button"
                        disabled={index === 0}
                        onClick={() =>
                            setIndex((current) => Math.max(0, current - 1))
                        }
                    >
                        K · Previous
                    </button>
                    <span>
                        {index + 1} / {queue.length}
                    </span>
                    <button
                        className="button"
                        type="button"
                        disabled={index >= queue.length - 1}
                        onClick={() =>
                            setIndex((current) =>
                                Math.min(queue.length - 1, current + 1)
                            )
                        }
                    >
                        J · Next
                    </button>
                </div>
            </header>
            <div className="triage-layout">
                <article className="triage-card">
                    <div className="triage-card-meta">
                        <span className="mono">{task.id}</span>
                        <span>{task.status}</span>
                        <span>{task.priority}</span>
                        <span>{task.type}</span>
                        <span>{task.area}</span>
                        {task.parent && <span>↳ {task.parent}</span>}
                    </div>
                    <h1>{task.title}</h1>
                    {task.source && (
                        <a href={`vscode://file${repoRoot}/${task.source}`}>
                            {task.source}
                        </a>
                    )}
                    <MarkdownBody source={task.body} />
                </article>
                <aside className="triage-actions">
                    <section>
                        <h2>Priority</h2>
                        {PRIORITIES.map((priority, priorityIndex) => (
                            <button
                                className={
                                    task.priority === priority
                                        ? "button is-active"
                                        : "button"
                                }
                                type="button"
                                key={priority}
                                onClick={() => void apply({ priority }, false)}
                            >
                                {priorityIndex + 1} · {priority}
                            </button>
                        ))}
                    </section>
                    <section>
                        <h2>Decision</h2>
                        {ACTIONS.map((action) => (
                            <button
                                className={`button ${action.className || ""}`}
                                type="button"
                                key={action.key}
                                onClick={() =>
                                    void apply({ status: action.status })
                                }
                            >
                                {action.key} · {action.label}
                            </button>
                        ))}
                    </section>
                    <button
                        className="button"
                        type="button"
                        onClick={() => onOpen(task.id)}
                    >
                        Open full card
                    </button>
                    <p>
                        Shortcuts work while focus is outside a form. Every
                        action updates the Markdown card immediately.
                    </p>
                </aside>
            </div>
        </main>
    );
}
