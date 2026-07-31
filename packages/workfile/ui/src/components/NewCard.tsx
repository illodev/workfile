import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
    NativeSelect,
    NativeSelectOption
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

import { PRIORITIES, TYPES, type Task } from "../types";

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
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent
                className="max-h-[85vh] overflow-y-auto sm:max-w-xl"
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    titleRef.current?.focus();
                }}
            >
                <DialogHeader>
                    <DialogTitle>New card</DialogTitle>
                    <DialogDescription>
                        Only the title is required. Everything else can be
                        changed later.
                    </DialogDescription>
                </DialogHeader>
                <form
                    id="new-card-form"
                    onSubmit={(event) => void submit(event)}
                    className="flex flex-col gap-3"
                >
                    <Field className="gap-1.5">
                        <FieldLabel htmlFor="new-card-title">
                            Title — up to 80 characters
                        </FieldLabel>
                        <Input
                            id="new-card-title"
                            ref={titleRef}
                            value={form.title}
                            maxLength={80}
                            onChange={(event) =>
                                update("title", event.target.value)
                            }
                        />
                    </Field>
                    <div className="grid grid-cols-3 gap-2.5">
                        {(
                            [
                                ["type", "Type", TYPES],
                                ["priority", "Priority", PRIORITIES],
                                ["area", "Area", areas]
                            ] as const
                        ).map(([key, label, options]) => (
                            <Field className="gap-1.5" key={key}>
                                <FieldLabel htmlFor={`new-card-${key}`}>
                                    {label}
                                </FieldLabel>
                                <NativeSelect
                                    id={`new-card-${key}`}
                                    value={form[key]}
                                    onChange={(event) =>
                                        update(key, event.target.value)
                                    }
                                >
                                    {options.map((option) => (
                                        <NativeSelectOption
                                            key={option}
                                            value={option}
                                        >
                                            {option}
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelect>
                            </Field>
                        ))}
                    </div>
                    <div className="grid grid-cols-[1fr_2fr] gap-2.5">
                        <Field className="gap-1.5">
                            <FieldLabel htmlFor="new-card-effort">
                                Effort
                            </FieldLabel>
                            <NativeSelect
                                id="new-card-effort"
                                value={form.effort}
                                onChange={(event) =>
                                    update("effort", event.target.value)
                                }
                            >
                                <NativeSelectOption value="">
                                    —
                                </NativeSelectOption>
                                <NativeSelectOption value="S">
                                    S
                                </NativeSelectOption>
                                <NativeSelectOption value="M">
                                    M
                                </NativeSelectOption>
                                <NativeSelectOption value="L">
                                    L
                                </NativeSelectOption>
                            </NativeSelect>
                        </Field>
                        <Field className="gap-1.5">
                            <FieldLabel htmlFor="new-card-parent">
                                Parent — epics and top-level cards
                            </FieldLabel>
                            <NativeSelect
                                id="new-card-parent"
                                value={form.parent}
                                onChange={(event) =>
                                    update("parent", event.target.value)
                                }
                            >
                                <NativeSelectOption value="">
                                    —
                                </NativeSelectOption>
                                {parents.map((task) => (
                                    <NativeSelectOption
                                        key={task.id}
                                        value={task.id}
                                    >
                                        {task.id} — {task.title}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                        {TEXT_FIELDS.map(([key, label]) => (
                            <Field className="gap-1.5" key={key}>
                                <FieldLabel htmlFor={`new-card-${key}`}>
                                    {label}
                                </FieldLabel>
                                <Input
                                    id={`new-card-${key}`}
                                    value={form[key]}
                                    onChange={(event) =>
                                        update(key, event.target.value)
                                    }
                                />
                            </Field>
                        ))}
                    </div>
                    <Field className="gap-1.5">
                        <FieldLabel htmlFor="new-card-body">
                            Description
                        </FieldLabel>
                        <Textarea
                            id="new-card-body"
                            className="min-h-24"
                            value={form.body}
                            onChange={(event) =>
                                update("body", event.target.value)
                            }
                        />
                    </Field>
                </form>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="new-card-form"
                        disabled={saving || !form.title.trim()}
                    >
                        {saving ? "Creating…" : "Create card"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
