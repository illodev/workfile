import { useEffect, useRef, useState, type FormEvent } from "react";

import { AREAS, PRIORITIES, TYPES, type Task } from "../types";

export function NewCardModal({
    tasks,
    onClose,
    onSubmit
}: {
    tasks: Task[];
    onClose: () => void;
    onSubmit: (input: Record<string, unknown>) => Promise<void>;
}) {
    const [form, setForm] = useState({
        title: "",
        type: "task",
        priority: "medium",
        area: "api",
        effort: "",
        parent: "",
        milestone: "",
        tags: "",
        scope: "",
        source: "",
        body: ""
    });
    const [saving, setSaving] = useState(false);
    const titleRef = useRef<HTMLInputElement>(null);
    useEffect(() => titleRef.current?.focus(), []);
    const update = (key: keyof typeof form, value: string) =>
        setForm((current) => ({ ...current, [key]: value }));
    async function submit(event: FormEvent) {
        event.preventDefault();
        setSaving(true);
        try {
            const split = (value: string) =>
                value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean);
            await onSubmit({
                ...form,
                effort: form.effort || undefined,
                parent: form.parent || undefined,
                milestone: form.milestone || undefined,
                source: form.source || undefined,
                tags: split(form.tags),
                scope: split(form.scope)
            });
        } finally {
            setSaving(false);
        }
    }
    return (
        <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <form
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="new-card-title"
                onSubmit={(event) => void submit(event)}
            >
                <header>
                    <h2 id="new-card-title">New card</h2>
                    <button
                        className="icon-button"
                        type="button"
                        aria-label="Close"
                        onClick={onClose}
                    >
                        ×
                    </button>
                </header>
                <div className="modal-content">
                    <label>
                        <span>Title</span>
                        <input
                            ref={titleRef}
                            value={form.title}
                            maxLength={80}
                            onChange={(event) =>
                                update("title", event.target.value)
                            }
                        />
                    </label>
                    <div className="form-grid">
                        {(
                            [
                                ["type", TYPES],
                                ["priority", PRIORITIES],
                                ["area", AREAS]
                            ] as const
                        ).map(([key, options]) => (
                            <label key={key}>
                                <span>{key}</span>
                                <select
                                    value={form[key]}
                                    onChange={(event) =>
                                        update(key, event.target.value)
                                    }
                                >
                                    {options.map((option) => (
                                        <option key={option}>{option}</option>
                                    ))}
                                </select>
                            </label>
                        ))}
                        <label>
                            <span>Effort</span>
                            <select
                                value={form.effort}
                                onChange={(event) =>
                                    update("effort", event.target.value)
                                }
                            >
                                <option value="">—</option>
                                <option>S</option>
                                <option>M</option>
                                <option>L</option>
                            </select>
                        </label>
                        <label>
                            <span>Parent</span>
                            <input
                                list="parent-cards"
                                value={form.parent}
                                onChange={(event) =>
                                    update("parent", event.target.value)
                                }
                            />
                            <datalist id="parent-cards">
                                {tasks
                                    .filter(
                                        (task) =>
                                            !task.archived &&
                                            (task.type === "epic" ||
                                                !task.parent)
                                    )
                                    .map((task) => (
                                        <option key={task.id} value={task.id}>
                                            {task.title}
                                        </option>
                                    ))}
                            </datalist>
                        </label>
                        {(
                            ["milestone", "tags", "scope", "source"] as const
                        ).map((key) => (
                            <label key={key}>
                                <span>{key}</span>
                                <input
                                    value={form[key]}
                                    onChange={(event) =>
                                        update(key, event.target.value)
                                    }
                                />
                            </label>
                        ))}
                    </div>
                    <label>
                        <span>Description</span>
                        <textarea
                            value={form.body}
                            onChange={(event) =>
                                update("body", event.target.value)
                            }
                        />
                    </label>
                </div>
                <footer>
                    <button className="button" type="button" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className="button button-primary"
                        type="submit"
                        disabled={saving || !form.title.trim()}
                    >
                        {saving ? "Creating…" : "Create card"}
                    </button>
                </footer>
            </form>
        </div>
    );
}
