import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { GraduationCap, Pencil, Plus, Replace } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item } from "@/components/ui/item";
import {
    NativeSelect,
    NativeSelectOption
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { api } from "../api";
import { READ_ONLY_HINT, useReadOnly } from "../read-only";
import { RecordCursor } from "../record-cursor";
import { changeTouches, useWorkspaceChanges } from "../store/live";
import { recordStatusColor, severityColor } from "../theme";
import type {
    MemoryCollectionSchema,
    MemoryFilters,
    MemoryRecord,
    RecordIssue,
    RecordLink,
    RuntimeSchema
} from "../types";
import { FilterBar, FilterChip } from "./FilterBar";
import { FilterSearch } from "./FilterSearch";
import { MarkdownBody } from "./Markdown";

/**
 * Memory: one lane per collection (learnings, decisions, incidents,
 * conventions, context), and a tile per record. Selecting one opens the app's
 * drawer, which renders `MemoryPanel` from this module — this view composed
 * its own drawer around the same panel until that turned out to be one of four
 * copies of the same overlay, each with its own idea of selection and closing.
 * Lanes are
 * shadcn Cards sharing the kanban geometry; behaviour is the old view's
 * inventory (search, filters, live reload, create, edit, graduate, supersede —
 * all with `If-Match` revisions).
 */

const CONFIDENCES = ["low", "medium", "high"];
const SEVERITIES = ["critical", "high", "medium", "low"];

/** Bottom scroll-fade on lane scrollers, per the design's kanban lanes. */
const SCROLL_FADE =
    "[mask-image:linear-gradient(to_bottom,black_calc(100%_-_24px),transparent)]";

function capitalise(value: string) {
    return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function plural(count: number, noun: string) {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Which optional fields a collection carries, shared by create and edit. */
function collectionFields(collection: string) {
    return {
        category: collection === "learnings" || collection === "decisions",
        confidence: collection === "learnings",
        severity: collection === "incidents",
        expires: collection === "context",
        review_after: collection === "context"
    };
}

/** The most informative secondary line a record carries, per collection. */
function tileNote(record: MemoryRecord): string {
    const parts: Array<string | null | undefined> = [];
    switch (record.collection) {
        case "learnings":
            parts.push(
                record.confidence,
                record.category,
                record.occurrences != null ? `${record.occurrences}×` : null
            );
            break;
        case "decisions":
            if (record.superseded_by?.length)
                parts.push(`superseded by ${record.superseded_by.join(", ")}`);
            else if (record.supersedes?.length)
                parts.push(`supersedes ${record.supersedes.join(", ")}`);
            else parts.push(record.category);
            break;
        case "incidents":
            parts.push(
                record.severity,
                record.corrective_actions?.length
                    ? plural(
                          record.corrective_actions.length,
                          "corrective action"
                      )
                    : null
            );
            break;
        case "conventions":
            parts.push(
                record.owners?.length ? record.owners.join(", ") : "no owner"
            );
            break;
        case "context":
            parts.push(
                record.expires ? `expires ${record.expires}` : null,
                record.review_after ? `review after ${record.review_after}` : null
            );
            break;
        default:
            parts.push(record.category, record.severity);
    }
    return parts.filter(Boolean).join(" · ");
}

/** Labelled form field for the dialogs, on the registry Field family. */
function FormField({
    id,
    label,
    children
}: {
    id: string;
    label: ReactNode;
    children: ReactNode;
}) {
    return (
        <Field className="gap-1.5 [&_[data-slot=native-select-wrapper]]:w-full">
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            {children}
        </Field>
    );
}

function MemoryTile({
    record,
    selected,
    onSelect
}: {
    record: MemoryRecord;
    selected: boolean;
    onSelect: () => void;
}) {
    const note = tileNote(record);
    const warnings = record.lifecycleIssues?.length || 0;
    return (
        <Item
            asChild
            variant="outline"
            size="sm"
            className="w-full flex-none flex-col items-stretch gap-1 rounded-lg bg-background px-2.5 py-2 text-left shadow-xs hover:border-ring aria-[current=true]:border-ring aria-[current=true]:bg-accent"
        >
            <button
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={onSelect}
            >
                <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                        {record.id}
                    </span>
                    <Badge
                        variant="outline"
                        className="h-[18px] gap-1 rounded-md px-1.5 font-mono text-[10px] font-medium"
                    >
                        <span
                            className="size-[5px] shrink-0 rounded-full"
                            style={{
                                backgroundColor: recordStatusColor(
                                    record.status
                                )
                            }}
                            aria-hidden="true"
                        />
                        {record.status}
                    </Badge>
                </span>
                <span className="text-[13px] font-medium leading-snug">
                    {record.title}
                </span>
                {note || warnings ? (
                    <span className="font-mono text-[10.5px] text-muted-foreground">
                        {note}
                        {note && warnings ? " · " : null}
                        {warnings ? (
                            <span style={{ color: severityColor("warning") }}>
                                {plural(warnings, "lifecycle warning")}
                            </span>
                        ) : null}
                    </span>
                ) : null}
            </button>
        </Item>
    );
}

function IssueCallouts({
    issues,
    kind
}: {
    issues: RecordIssue[];
    kind: "validation" | "lifecycle";
}) {
    if (!issues.length) return null;
    return (
        <>
            {issues.map((issue) => (
                <Alert
                    key={`${kind}-${issue.code}-${issue.message}`}
                    variant={
                        issue.severity === "error" ? "destructive" : "default"
                    }
                    className="px-3 py-2"
                >
                    <AlertDescription className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span
                            className="font-mono text-[10.5px]"
                            style={{ color: severityColor(issue.severity) }}
                        >
                            {kind === "lifecycle" ? "lifecycle" : issue.severity}
                        </span>
                        <span>{issue.message}</span>
                    </AlertDescription>
                </Alert>
            ))}
        </>
    );
}

function RelationList({
    label,
    links,
    onOpen
}: {
    label: string;
    links: RecordLink[];
    onOpen: (id: string) => void;
}) {
    if (!links.length) return null;
    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {label}
            </span>
            {links.map((link) => {
                const dangling = !link.exists && !link.title;
                return (
                    <Item
                        key={`${label}-${link.id}`}
                        asChild
                        variant="outline"
                        size="sm"
                        className="gap-2 rounded-lg px-2.5 py-2 text-left hover:border-ring disabled:pointer-events-none disabled:opacity-50"
                    >
                        <button
                            type="button"
                            disabled={dangling}
                            onClick={() => onOpen(link.id)}
                        >
                            <span className="w-[78px] shrink-0 truncate font-mono text-[11px] font-medium">
                                {link.id}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                {link.title || "Missing record"}
                            </span>
                            {/* One badge per relationship, falling back to the
                                record kind when the edge carries no relation. */}
                            {(link.relations ?? [link.relation || link.kind])
                                .filter(Boolean)
                                .map((relation) => (
                                    <Badge
                                        key={relation}
                                        variant="secondary"
                                        className="h-[18px] rounded-md px-1.5 font-mono text-[10px] font-medium"
                                    >
                                        {relation}
                                    </Badge>
                                ))}
                        </button>
                    </Item>
                );
            })}
        </div>
    );
}

function DialogError({ message }: { message: string }) {
    if (!message) return null;
    return (
        <Alert variant="destructive" className="px-3 py-2">
            <AlertDescription>{message}</AlertDescription>
        </Alert>
    );
}

function CreateDialog({
    schema,
    initialCollection,
    onClose,
    onCreated
}: {
    schema: RuntimeSchema["memory"];
    initialCollection: string;
    onClose: () => void;
    onCreated: (record: MemoryRecord) => void;
}) {
    const first =
        schema.collections.find((item) => item.id === initialCollection) ||
        schema.collections[0];
    const [form, setForm] = useState({
        collection: first?.id || "learnings",
        status: first?.statuses[0] || "active",
        title: "",
        category: "",
        confidence: "",
        severity: "",
        expires: "",
        body: ""
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const collection = schema.collections.find(
        (item) => item.id === form.collection
    );
    const fields = collectionFields(form.collection);
    const update = (key: keyof typeof form, value: string) =>
        setForm((current) => ({ ...current, [key]: value }));
    const changeCollection = (value: string) => {
        const next = schema.collections.find((item) => item.id === value);
        setForm((current) => ({
            ...current,
            collection: value,
            status: next?.statuses[0] || "active"
        }));
    };
    const submit = async () => {
        setSaving(true);
        try {
            const result = await api.createMemory({
                collection: form.collection,
                title: form.title,
                status: form.status,
                body: form.body,
                category: form.category || undefined,
                confidence: form.confidence || undefined,
                severity: form.severity || undefined,
                expires: form.expires || undefined
            });
            onCreated(result.record);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog
            open
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogContent
                className="sm:max-w-[520px]"
                aria-describedby={undefined}
            >
                <DialogHeader>
                    <DialogTitle>
                        New {collection?.singular || "record"}
                    </DialogTitle>
                </DialogHeader>
                <div className="-m-1 flex max-h-[65vh] flex-col gap-3 overflow-y-auto p-1">
                    <div className="grid grid-cols-2 gap-2.5">
                        <FormField id="memory-create-collection" label="Collection">
                            <NativeSelect
                                id="memory-create-collection"
                                value={form.collection}
                                onChange={(event) =>
                                    changeCollection(event.target.value)
                                }
                            >
                                {schema.collections.map((item) => (
                                    <NativeSelectOption
                                        key={item.id}
                                        value={item.id}
                                    >
                                        {item.id}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </FormField>
                        <FormField id="memory-create-status" label="Status">
                            <NativeSelect
                                id="memory-create-status"
                                value={form.status}
                                onChange={(event) =>
                                    update("status", event.target.value)
                                }
                            >
                                {(collection?.statuses || []).map((status) => (
                                    <NativeSelectOption
                                        key={status}
                                        value={status}
                                    >
                                        {status}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </FormField>
                    </div>
                    <FormField id="memory-create-title" label="Title">
                        <Input
                            id="memory-create-title"
                            autoFocus
                            required
                            maxLength={120}
                            value={form.title}
                            onChange={(event) =>
                                update("title", event.target.value)
                            }
                        />
                    </FormField>
                    {fields.category ||
                    fields.confidence ||
                    fields.severity ||
                    fields.expires ? (
                        <div className="grid grid-cols-2 gap-2.5">
                            {fields.category ? (
                                <FormField
                                    id="memory-create-category"
                                    label="Category"
                                >
                                    <Input
                                        id="memory-create-category"
                                        value={form.category}
                                        onChange={(event) =>
                                            update(
                                                "category",
                                                event.target.value
                                            )
                                        }
                                    />
                                </FormField>
                            ) : null}
                            {fields.confidence ? (
                                <FormField
                                    id="memory-create-confidence"
                                    label="Confidence"
                                >
                                    <NativeSelect
                                        id="memory-create-confidence"
                                        value={form.confidence}
                                        onChange={(event) =>
                                            update(
                                                "confidence",
                                                event.target.value
                                            )
                                        }
                                    >
                                        <NativeSelectOption value="">
                                            not set
                                        </NativeSelectOption>
                                        {CONFIDENCES.map((value) => (
                                            <NativeSelectOption
                                                key={value}
                                                value={value}
                                            >
                                                {value}
                                            </NativeSelectOption>
                                        ))}
                                    </NativeSelect>
                                </FormField>
                            ) : null}
                            {fields.severity ? (
                                <FormField
                                    id="memory-create-severity"
                                    label="Severity"
                                >
                                    <NativeSelect
                                        id="memory-create-severity"
                                        value={form.severity}
                                        onChange={(event) =>
                                            update(
                                                "severity",
                                                event.target.value
                                            )
                                        }
                                    >
                                        <NativeSelectOption value="">
                                            not set
                                        </NativeSelectOption>
                                        {SEVERITIES.map((value) => (
                                            <NativeSelectOption
                                                key={value}
                                                value={value}
                                            >
                                                {value}
                                            </NativeSelectOption>
                                        ))}
                                    </NativeSelect>
                                </FormField>
                            ) : null}
                            {fields.expires ? (
                                <FormField
                                    id="memory-create-expires"
                                    label="Expires"
                                >
                                    <Input
                                        id="memory-create-expires"
                                        type="date"
                                        value={form.expires}
                                        onChange={(event) =>
                                            update(
                                                "expires",
                                                event.target.value
                                            )
                                        }
                                    />
                                </FormField>
                            ) : null}
                        </div>
                    ) : null}
                    <FormField id="memory-create-body" label="Details">
                        <Textarea
                            id="memory-create-body"
                            rows={8}
                            value={form.body}
                            onChange={(event) =>
                                update("body", event.target.value)
                            }
                        />
                    </FormField>
                    <DialogError message={error} />
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={saving || !form.title.trim()}
                        onClick={() => void submit()}
                    >
                        {saving ? (
                            <>
                                <Spinner aria-hidden="true" />
                                Saving…
                            </>
                        ) : (
                            "Create record"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EditDialog({
    record,
    statuses,
    onClose,
    onUpdated
}: {
    record: MemoryRecord;
    statuses: string[];
    onClose: () => void;
    onUpdated: (record: MemoryRecord) => void;
}) {
    const fields = collectionFields(record.collection);
    const [form, setForm] = useState({
        title: record.title,
        status: record.status,
        category: record.category || "",
        confidence: record.confidence || "",
        severity: record.severity || "",
        expires: record.expires || "",
        review_after: record.review_after || "",
        body: record.body
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const update = (key: keyof typeof form, value: string) =>
        setForm((current) => ({ ...current, [key]: value }));
    const submit = async () => {
        const changes: Record<string, unknown> = {};
        if (form.title.trim() && form.title !== record.title)
            changes.title = form.title;
        if (form.status !== record.status) changes.status = form.status;
        if (form.body !== record.body) changes.body = form.body;
        const optional = [
            "category",
            "confidence",
            "severity",
            "expires",
            "review_after"
        ] as const;
        for (const key of optional) {
            if (form[key] !== (record[key] || ""))
                changes[key] = form[key] || null;
        }
        if (!Object.keys(changes).length) {
            onClose();
            return;
        }
        setSaving(true);
        try {
            const result = await api.patchMemory(
                record.id,
                changes,
                record.revision
            );
            onUpdated(result.record);
            onClose();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog
            open
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogContent
                className="sm:max-w-[520px]"
                aria-describedby={undefined}
            >
                <DialogHeader>
                    <DialogTitle>Edit {record.id}</DialogTitle>
                </DialogHeader>
                <div className="-m-1 flex max-h-[65vh] flex-col gap-3 overflow-y-auto p-1">
                    <FormField id="memory-edit-title" label="Title">
                        <Input
                            id="memory-edit-title"
                            autoFocus
                            required
                            maxLength={120}
                            value={form.title}
                            onChange={(event) =>
                                update("title", event.target.value)
                            }
                        />
                    </FormField>
                    <div className="grid grid-cols-2 gap-2.5">
                        <FormField id="memory-edit-status" label="Status">
                            <NativeSelect
                                id="memory-edit-status"
                                value={form.status}
                                onChange={(event) =>
                                    update("status", event.target.value)
                                }
                            >
                                {(statuses.includes(form.status)
                                    ? statuses
                                    : [form.status, ...statuses]
                                ).map((status) => (
                                    <NativeSelectOption
                                        key={status}
                                        value={status}
                                    >
                                        {status}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </FormField>
                        {fields.category ? (
                            <FormField
                                id="memory-edit-category"
                                label="Category"
                            >
                                <Input
                                    id="memory-edit-category"
                                    value={form.category}
                                    onChange={(event) =>
                                        update("category", event.target.value)
                                    }
                                />
                            </FormField>
                        ) : null}
                        {fields.confidence ? (
                            <FormField
                                id="memory-edit-confidence"
                                label="Confidence"
                            >
                                <NativeSelect
                                    id="memory-edit-confidence"
                                    value={form.confidence}
                                    onChange={(event) =>
                                        update(
                                            "confidence",
                                            event.target.value
                                        )
                                    }
                                >
                                    <NativeSelectOption value="">
                                        not set
                                    </NativeSelectOption>
                                    {CONFIDENCES.map((value) => (
                                        <NativeSelectOption
                                            key={value}
                                            value={value}
                                        >
                                            {value}
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelect>
                            </FormField>
                        ) : null}
                        {fields.severity ? (
                            <FormField
                                id="memory-edit-severity"
                                label="Severity"
                            >
                                <NativeSelect
                                    id="memory-edit-severity"
                                    value={form.severity}
                                    onChange={(event) =>
                                        update("severity", event.target.value)
                                    }
                                >
                                    <NativeSelectOption value="">
                                        not set
                                    </NativeSelectOption>
                                    {SEVERITIES.map((value) => (
                                        <NativeSelectOption
                                            key={value}
                                            value={value}
                                        >
                                            {value}
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelect>
                            </FormField>
                        ) : null}
                        {fields.expires ? (
                            <FormField id="memory-edit-expires" label="Expires">
                                <Input
                                    id="memory-edit-expires"
                                    type="date"
                                    value={form.expires}
                                    onChange={(event) =>
                                        update("expires", event.target.value)
                                    }
                                />
                            </FormField>
                        ) : null}
                        {fields.review_after ? (
                            <FormField
                                id="memory-edit-review-after"
                                label="Review after"
                            >
                                <Input
                                    id="memory-edit-review-after"
                                    type="date"
                                    value={form.review_after}
                                    onChange={(event) =>
                                        update(
                                            "review_after",
                                            event.target.value
                                        )
                                    }
                                />
                            </FormField>
                        ) : null}
                    </div>
                    <FormField id="memory-edit-body" label="Details">
                        <Textarea
                            id="memory-edit-body"
                            rows={10}
                            value={form.body}
                            onChange={(event) =>
                                update("body", event.target.value)
                            }
                        />
                    </FormField>
                    <DialogError message={error} />
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={saving || !form.title.trim()}
                        onClick={() => void submit()}
                    >
                        {saving ? (
                            <>
                                <Spinner aria-hidden="true" />
                                Saving…
                            </>
                        ) : (
                            "Save changes"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function LifecycleDialog({
    record,
    mode,
    onClose,
    onUpdated
}: {
    record: MemoryRecord;
    mode: "graduate" | "supersede";
    onClose: () => void;
    onUpdated: (record: MemoryRecord) => void;
}) {
    const [value, setValue] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const submit = async () => {
        setSaving(true);
        try {
            const result =
                mode === "graduate"
                    ? await api.graduateMemory(
                          record.id,
                          value
                              .split(",")
                              .map((item) => item.trim())
                              .filter(Boolean),
                          record.revision
                      )
                    : await api.supersedeMemory(
                          record.id,
                          value.trim(),
                          record.revision
                      );
            onUpdated(result.record);
            onClose();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog
            open
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogContent
                className="sm:max-w-[420px]"
                aria-describedby={undefined}
            >
                <DialogHeader>
                    <DialogTitle>
                        {mode === "graduate" ? "Graduate" : "Supersede"}{" "}
                        {record.id}
                    </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <FormField
                        id="memory-lifecycle-target"
                        label={
                            mode === "graduate" ? "Target IDs" : "Replacement ID"
                        }
                    >
                        <Input
                            id="memory-lifecycle-target"
                            autoFocus
                            placeholder={
                                mode === "graduate"
                                    ? "CONV-0001, DOC-0004"
                                    : "ADR-0009"
                            }
                            value={value}
                            onChange={(event) => setValue(event.target.value)}
                        />
                    </FormField>
                    <DialogError message={error} />
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={saving || !value.trim()}
                        onClick={() => void submit()}
                    >
                        {saving ? (
                            <>
                                <Spinner aria-hidden="true" />
                                Saving…
                            </>
                        ) : (
                            "Apply"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DetailPanel({
    record,
    statuses,
    onOpenRelation,
    onOpenRecord,
    onUpdated,
    onDialogOpenChange
}: {
    record: MemoryRecord;
    statuses: string[];
    onOpenRelation: (id: string) => void;
    onOpenRecord: (id: string) => void;
    onUpdated: (record: MemoryRecord) => void;
    /** Raised while a dialog is up: the drawer around this must not treat a
     *  click inside that dialog as an interaction outside itself. */
    onDialogOpenChange?: (open: boolean) => void;
}) {
    const readOnly = useReadOnly();
    const [editing, setEditing] = useState(false);
    const [lifecycle, setLifecycle] = useState<"" | "graduate" | "supersede">(
        ""
    );
    const dialogOpen = editing || Boolean(lifecycle);
    useEffect(() => {
        onDialogOpenChange?.(dialogOpen);
    }, [dialogOpen, onDialogOpenChange]);
    const canGraduate =
        record.collection === "learnings" && record.status !== "graduated";
    const canSupersede = ["learnings", "decisions", "conventions"].includes(
        record.collection
    );
    const cells: Array<[string, string, string?]> = [
        ["status", record.status, recordStatusColor(record.status)]
    ];
    if (record.category) cells.push(["category", record.category]);
    if (record.confidence) cells.push(["confidence", record.confidence]);
    if (record.severity)
        cells.push([
            "severity",
            record.severity,
            severityColor(record.severity)
        ]);
    if (record.occurrences != null)
        cells.push(["occurrences", String(record.occurrences)]);
    if (record.expires) cells.push(["expires", record.expires]);
    if (record.review_after) cells.push(["review after", record.review_after]);
    if (record.started_at) cells.push(["started", record.started_at]);
    if (record.resolved_at) cells.push(["resolved", record.resolved_at]);
    if (record.graduated_to?.length)
        cells.push(["graduated to", record.graduated_to.join(", ")]);
    if (record.superseded_by?.length)
        cells.push(["superseded by", record.superseded_by.join(", ")]);
    if (record.owners?.length) cells.push(["owners", record.owners.join(", ")]);
    cells.push(["updated", record.updated || "—"]);
    // The drawer supplies the frame and the close control, so this is the
    // Inspector's shape rather than a card of its own: a bordered column with
    // an identity bar over a scrolling body.
    return (
        <aside
            aria-label="Memory record"
            className="flex min-h-0 flex-col overflow-hidden border-l bg-background"
        >
            <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3.5">
                <span className="font-mono text-[11px] text-muted-foreground">
                    {record.id}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground/60">
                    ·
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                    {record.collection}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground/60">
                    ·
                </span>
                <span
                    className="font-mono text-[11px]"
                    style={{ color: recordStatusColor(record.status) }}
                >
                    {record.status}
                </span>
                {/* Right end of the identity bar, which is where the card
                    inspector puts the same control. Absent unless the reader
                    arrived from a list — T-0207. */}
                <span className="flex-1" />
                <RecordCursor />
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4">
                <div className="flex flex-col gap-1.5">
                    <h2 className="m-0 text-[17px] font-semibold leading-[1.3] tracking-[-0.01em] [text-wrap:pretty]">
                        {record.title}
                    </h2>
                    {record.path ? (
                        <span className="break-all font-mono text-[10.5px] text-muted-foreground">
                            {record.path}
                        </span>
                    ) : null}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {cells.map(([label, value, color]) => (
                        <span className="flex flex-col gap-0.5" key={label}>
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                {label}
                            </span>
                            <span
                                className="text-sm"
                                style={color ? { color } : undefined}
                            >
                                {value}
                            </span>
                        </span>
                    ))}
                </div>
                <IssueCallouts issues={record.issues} kind="validation" />
                <IssueCallouts
                    issues={record.lifecycleIssues || []}
                    kind="lifecycle"
                />
                {/* `.typeset` inherits the 16px document root, so the record
                    body rendered a size larger than anything around it — the
                    panel's own metadata is 11px and the app's body text 14.
                    This is a side panel, not a document reader. */}
                <MarkdownBody
                    className="[--typeset-size:0.875rem]"
                    source={record.body || "No details recorded."}
                    onOpen={onOpenRecord}
                />
                <RelationList
                    label="Links to"
                    links={record.outgoing}
                    onOpen={onOpenRelation}
                />
                <RelationList
                    label="Backlinks"
                    links={record.incoming}
                    onOpen={onOpenRelation}
                />
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={readOnly}
                        title={readOnly ? READ_ONLY_HINT : undefined}
                        onClick={() => setEditing(true)}
                    >
                        <Pencil aria-hidden="true" />
                        Edit
                    </Button>
                    {canGraduate ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={readOnly}
                            title={readOnly ? READ_ONLY_HINT : undefined}
                            onClick={() => setLifecycle("graduate")}
                        >
                            <GraduationCap aria-hidden="true" />
                            Graduate
                        </Button>
                    ) : null}
                    {canSupersede ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={readOnly}
                            title={readOnly ? READ_ONLY_HINT : undefined}
                            onClick={() => setLifecycle("supersede")}
                        >
                            <Replace aria-hidden="true" />
                            Supersede
                        </Button>
                    ) : null}
                </div>
            </div>
            {editing ? (
                <EditDialog
                    record={record}
                    statuses={statuses}
                    onClose={() => setEditing(false)}
                    onUpdated={onUpdated}
                />
            ) : null}
            {lifecycle ? (
                <LifecycleDialog
                    record={record}
                    mode={lifecycle}
                    onClose={() => setLifecycle("")}
                    onUpdated={onUpdated}
                />
            ) : null}
        </aside>
    );
}

function collectionStatuses(
    collections: MemoryCollectionSchema[],
    collection: string
) {
    return collections.find((item) => item.id === collection)?.statuses || [];
}

/**
 * A memory record in the shared drawer, fetched by ID.
 *
 * `DetailPanel` needs the record; the drawer only knows an ID, because the
 * selection is app-wide and the reader may have arrived from the graph or from
 * a link in a card body rather than from these lanes. Reading it here is what
 * lets one drawer serve every kind while each kind keeps the panel that knows
 * how to edit it.
 *
 * Lazily imported by `main.tsx` from this module rather than a new one, so it
 * rides the memory chunk that already exists instead of pulling the lanes into
 * the entry bundle.
 */
export function MemoryPanel({
    id,
    schema,
    onSelect,
    onOpenRecord,
    onDialogOpenChange,
    onChanged
}: {
    id: string;
    schema: RuntimeSchema["memory"];
    onSelect: (id: string) => void;
    onOpenRecord: (id: string) => void;
    onDialogOpenChange?: (open: boolean) => void;
    /** Raised after a write, so a list showing this record can catch up. */
    onChanged?: () => void;
}) {
    const [record, setRecord] = useState<MemoryRecord | null>(null);
    const [error, setError] = useState("");
    useEffect(() => {
        let live = true;
        setRecord(null);
        setError("");
        api.record(id)
            .then((response) => {
                if (live) setRecord(response.record as unknown as MemoryRecord);
            })
            .catch((cause: Error) => {
                if (live) setError(cause.message);
            });
        return () => {
            live = false;
        };
    }, [id]);

    if (error) {
        return (
            <div className="px-4 py-3 text-xs text-muted-foreground">{error}</div>
        );
    }
    if (!record) {
        return (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                <Spinner /> Reading {id}…
            </div>
        );
    }
    return (
        <DetailPanel
            key={record.id}
            record={record}
            statuses={collectionStatuses(schema.collections, record.collection)}
            onOpenRelation={onSelect}
            onOpenRecord={onOpenRecord}
            onUpdated={(next) => {
                setRecord(next);
                onChanged?.();
            }}
            onDialogOpenChange={onDialogOpenChange}
        />
    );
}

export function MemoryView({
    selectedId,
    onSelect,
    onOpenRecord,
    schema,
    search,
    onSearchChange,
    filters,
    onFiltersChange
}: {
    selectedId: string | null;
    // The second argument is the list the click came from, in display order,
    // which is what the reader's previous/next cursor walks (T-0207).
    onSelect: (id: string, orderedIds?: string[]) => void;
    onOpenRecord: (id: string) => void;
    schema: RuntimeSchema["memory"];
    // Owned by the shell, shared with docs and history, and serialised to the
    // address bar: the local state this replaced died on every reload.
    search: string;
    onSearchChange: (value: string) => void;
    // These two by the same route and for the same reason (T-0201). Narrowing
    // to open incidents, opening one and coming back used to hand back every
    // record in the workspace, with nothing saying the narrowing had been there.
    filters: MemoryFilters;
    onFiltersChange: (patch: Partial<MemoryFilters>) => void;
}) {
    const readOnly = useReadOnly();
    const [records, setRecords] = useState<MemoryRecord[]>([]);
    const { collection, status } = filters;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [createFor, setCreateFor] = useState<string | null>(null);
    // Every tile click stamps this: Radix defers its pointer-down-outside
    // dispatch until after the click handlers have run, so browsing tile to
    // tile would otherwise dismiss the drawer the click just retargeted.
    const lastSelectRef = useRef(0);
    const selectRecord = useCallback(
        // `orderedIds` is omitted where the caller is not a lane tile — a
        // relation row inside the panel, say — so the cursor goes absent
        // rather than claiming the lanes as context for something reached
        // from outside them.
        (id: string, orderedIds?: string[]) => {
            lastSelectRef.current = performance.now();
            onSelect(id, orderedIds);
        },
        [onSelect]
    );

    const [reloadKey, setReloadKey] = useState(0);
    useWorkspaceChanges((change) => {
        if (changeTouches(change, "/memory/")) setReloadKey((key) => key + 1);
    });
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const response = await api.memory(search.trim(), {
                    collection: collection || undefined,
                    status: status || undefined
                });
                setRecords(response.records);
                setError("");
            } catch (reason) {
                setError(
                    reason instanceof Error ? reason.message : String(reason)
                );
            } finally {
                setLoading(false);
            }
        };
        const timer = window.setTimeout(() => void load(), search ? 180 : 0);
        return () => window.clearTimeout(timer);
    }, [search, collection, status, reloadKey]);

    const sorted = useMemo(
        () =>
            [...records].sort(
                (left, right) =>
                    String(right.updated || "").localeCompare(
                        String(left.updated || "")
                    ) || left.title.localeCompare(right.title)
            ),
        [records]
    );
    const lanes = useMemo(() => {
        const known = schema.collections
            .filter((item) => !collection || item.id === collection)
            .map((item) => ({
                schema: item,
                records: sorted.filter(
                    (record) => record.collection === item.id
                )
            }));
        const knownIds = new Set(schema.collections.map((item) => item.id));
        const leftovers = sorted.filter(
            (record) => !knownIds.has(record.collection)
        );
        if (leftovers.length) {
            known.push({
                schema: {
                    id: "other",
                    singular: "record",
                    idPrefix: "?",
                    statuses: []
                },
                records: leftovers
            });
        }
        return known;
    }, [schema.collections, sorted, collection]);

    /**
     * The list the reader's previous/next cursor walks: lane by lane, each lane
     * top to bottom, which is how the columns are read. Derived from `lanes`
     * rather than from `sorted` so the collection filter narrows it too — a
     * cursor that steps into a lane the reader has filtered away has jumped
     * (T-0207).
     */
    const order = useMemo(
        () => lanes.flatMap((lane) => lane.records.map((record) => record.id)),
        [lanes]
    );

    const active = sorted.find((record) => record.id === selectedId);
    const statuses = collection
        ? collectionStatuses(schema.collections, collection)
        : [...new Set(schema.collections.flatMap((item) => item.statuses))];
    const openRelation = (id: string) => {
        if (records.some((record) => record.id === id)) selectRecord(id);
        else onOpenRecord(id);
    };
    const applyUpdate = (record: MemoryRecord) =>
        setRecords((current) =>
            current.map((item) => (item.id === record.id ? record : item))
        );

    return (
        <>
            {/* The field owns its own line, in every view that has one. It
                used to share the row with the chips and the record count,
                which squeezed it to about 40px and clipped the count against
                the edge; a field that cannot be shortened by a sibling cannot
                come back from that. */}
            <FilterBar
                gutter="3.5"
                className="pt-3.5"
                before={
                    <FilterSearch
                        scope="records"
                        value={search}
                        label="Search workfile memory"
                        onChange={onSearchChange}
                    />
                }
                after={
                    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                        {loading ? (
                            <>
                                <Spinner
                                    aria-hidden="true"
                                    className="size-3"
                                />
                                loading…
                            </>
                        ) : (
                            plural(records.length, "record")
                        )}
                    </span>
                }
            >
                <FilterChip
                    label="collection"
                    value={collection}
                    options={schema.collections.map((item) => ({
                        value: item.id
                    }))}
                    // One patch, not two calls: the status belongs to the
                    // collection's vocabulary, so it clears with it, and
                    // clearing it separately would put a state no chip ever
                    // showed into the address bar on the way past.
                    onChange={(next) =>
                        onFiltersChange({ collection: next, status: "" })
                    }
                />
                <FilterChip
                    label="status"
                    value={status}
                    options={statuses.map((value) => ({
                        value,
                        color: recordStatusColor(value)
                    }))}
                    onChange={(next) => onFiltersChange({ status: next })}
                />
            </FilterBar>
            {error ? (
                <Alert
                    variant="destructive"
                    className="mx-3.5 mt-3 w-auto px-3 py-2"
                >
                    <AlertDescription>
                        Memory could not be loaded: {error}
                    </AlertDescription>
                </Alert>
            ) : null}
            <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-3.5">
                {/* The record reads in the drawer now, over the lanes rather
                    than beside them, so the lanes keep their full width at
                    every viewport instead of yielding half of it — or, below
                    `lg`, all of it. */}
                <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto">
                    {lanes.map((lane) => (
                        <Card
                            key={lane.schema.id}
                            className="w-[272px] flex-none gap-0 overflow-hidden rounded-xl py-0 [--card-spacing:--spacing(2)]"
                        >
                            <CardHeader className="flex flex-row items-center gap-2 border-b px-3 py-2">
                                <span className="font-mono text-[11px] font-medium text-primary">
                                    {lane.schema.idPrefix}
                                </span>
                                <span className="flex-1 text-[12.5px] font-semibold">
                                    {capitalise(lane.schema.singular)}
                                </span>
                                <Badge
                                    variant="secondary"
                                    className="h-5 px-1.5 font-mono text-[11px] font-normal"
                                >
                                    {lane.records.length}
                                </Badge>
                                {lane.schema.id !== "other" ? (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        aria-label={`New ${lane.schema.singular}`}
                                        disabled={readOnly}
                                        title={
                                            readOnly ? READ_ONLY_HINT : undefined
                                        }
                                        onClick={() =>
                                            setCreateFor(lane.schema.id)
                                        }
                                    >
                                        <Plus aria-hidden="true" />
                                    </Button>
                                ) : null}
                            </CardHeader>
                            <CardContent
                                className={cn(
                                    "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5",
                                    SCROLL_FADE
                                )}
                            >
                                {lane.records.map((record) => (
                                    <MemoryTile
                                        key={record.id}
                                        record={record}
                                        selected={record.id === selectedId}
                                        onSelect={() =>
                                            selectRecord(record.id, order)
                                        }
                                    />
                                ))}
                                {!lane.records.length && !loading ? (
                                    <Empty className="gap-1 border border-dashed p-4 md:p-6">
                                        <EmptyDescription className="font-mono text-xs">
                                            no records
                                        </EmptyDescription>
                                    </Empty>
                                ) : null}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
            {createFor !== null ? (
                <CreateDialog
                    schema={schema}
                    initialCollection={createFor}
                    onClose={() => setCreateFor(null)}
                    onCreated={(record) => {
                        setCreateFor(null);
                        setRecords((current) => [record, ...current]);
                        onSelect(record.id);
                    }}
                />
            ) : null}
        </>
    );
}
