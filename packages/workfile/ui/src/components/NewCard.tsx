import { useEffect, useRef, useState, type FormEvent } from "react";

import { PRIORITIES, TYPES, type Task } from "../types";
import { AppDialog, Field } from "../kit";

/** Free-text fields, with their visible label. */
const TEXT_FIELDS = [
    ["milestone", "Milestone"],
    ["tags", "Tags — comma-separated"],
    ["scope", "Scope — comma-separated"],
    ["source", "Source"]
] as const;

export function NewCardModal({
    tasks,
    areas,
    onClose,
    onSubmit
}: {
    tasks: Task[];
    areas: readonly string[];
    onClose: () => void;
    onSubmit: (input: Record<string, unknown>) => Promise<void>;
}) {
    const [form, setForm] = useState({
        title: "",
        type: "task",
        priority: "medium",
        area: areas[0] || "general",
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
    useEffect(() => {
        if (!areas.includes(form.area)) {
            setForm((current) => ({
                ...current,
                area: areas[0] || "general"
            }));
        }
    }, [areas, form.area]);
    const update = (key: keyof typeof form, value: string) =>
        setForm((current) => ({ ...current, [key]: value }));
    async function submit(event: FormEvent) {
        event.preventDefault();
        if (saving || !form.title.trim()) return;
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
    const parents = tasks.filter(
        (task) => !task.archived && (task.type === "epic" || !task.parent)
    );
    return (
        <AppDialog
            open
            title="New card"
            onClose={onClose}
            footer={
                <>
                    <button type="button" className="btn" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="new-card-form"
                        className="btn-accent"
                        disabled={saving || !form.title.trim()}
                    >
                        {saving ? "Creating…" : "Create card"}
                    </button>
                </>
            }
        >
            <form
                id="new-card-form"
                onSubmit={(event) => void submit(event)}
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
                <span style={{ fontSize: 12, color: "var(--fg-3)" }}>
                    Only the title is required. Everything else can be changed
                    later.
                </span>
                <Field label="Title — up to 80 characters">
                    <input
                        className="input"
                        ref={titleRef}
                        value={form.title}
                        maxLength={80}
                        onChange={(event) =>
                            update("title", event.target.value)
                        }
                    />
                </Field>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: 10
                    }}
                >
                    {(
                        [
                            ["type", "Type", TYPES],
                            ["priority", "Priority", PRIORITIES],
                            ["area", "Area", areas]
                        ] as const
                    ).map(([key, label, options]) => (
                        <Field label={label} key={key}>
                            <select
                                className="select"
                                value={form[key]}
                                onChange={(event) =>
                                    update(key, event.target.value)
                                }
                            >
                                {options.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    ))}
                </div>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 2fr",
                        gap: 10
                    }}
                >
                    <Field label="Effort">
                        <select
                            className="select"
                            value={form.effort}
                            onChange={(event) =>
                                update("effort", event.target.value)
                            }
                        >
                            <option value="">—</option>
                            <option value="S">S</option>
                            <option value="M">M</option>
                            <option value="L">L</option>
                        </select>
                    </Field>
                    <Field label="Parent — epics and top-level cards">
                        <select
                            className="select"
                            value={form.parent}
                            onChange={(event) =>
                                update("parent", event.target.value)
                            }
                        >
                            <option value="">—</option>
                            {parents.map((task) => (
                                <option key={task.id} value={task.id}>
                                    {task.id} — {task.title}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 10
                    }}
                >
                    {TEXT_FIELDS.map(([key, label]) => (
                        <Field label={label} key={key}>
                            <input
                                className="input"
                                value={form[key]}
                                onChange={(event) =>
                                    update(key, event.target.value)
                                }
                            />
                        </Field>
                    ))}
                </div>
                <Field label="Description">
                    <textarea
                        className="textarea"
                        value={form.body}
                        onChange={(event) =>
                            update("body", event.target.value)
                        }
                    />
                </Field>
            </form>
        </AppDialog>
    );
}
