import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Pencil, Plus, Replace, X } from "lucide-react";

import { api } from "../api";
import { AppDialog, ChipSelect, Field } from "../kit";
import { changeTouches, useWorkspaceChanges } from "../store/live";
import { recordStatusColor, severityColor } from "../theme";
import type {
    MemoryCollectionSchema,
    MemoryRecord,
    RecordIssue,
    RecordLink,
    RuntimeSchema
} from "../types";
import { MarkdownBody } from "./Markdown";

/**
 * Memory: one lane per collection (learnings, decisions, incidents,
 * conventions, context), a tile per record, and a right-hand detail panel
 * when a record is selected. Structure and spacing follow the design's
 * `isMemory` block; behaviour is the old view's inventory (search, filters,
 * live reload, create, edit, graduate, supersede — all with `If-Match`
 * revisions).
 */

const CONFIDENCES = ["low", "medium", "high"];
const SEVERITIES = ["critical", "high", "medium", "low"];

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
        <button
            type="button"
            className={selected ? "tile is-selected" : "tile"}
            aria-current={selected ? "true" : undefined}
            onClick={onSelect}
        >
            <span className="tile-row">
                <span className="mono dim" style={{ fontSize: 11 }}>
                    {record.id}
                </span>
                <span style={{ flex: 1 }} />
                <span
                    className="mono"
                    style={{
                        fontSize: 10,
                        color: recordStatusColor(record.status)
                    }}
                >
                    {record.status}
                </span>
            </span>
            <span className="tile-title">{record.title}</span>
            {note || warnings ? (
                <span className="tile-note">
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
                <div
                    key={`${kind}-${issue.code}-${issue.message}`}
                    className={
                        issue.severity === "error"
                            ? "callout callout-error"
                            : "callout"
                    }
                    style={{ margin: 0 }}
                >
                    <span
                        className="mono"
                        style={{
                            fontSize: 10.5,
                            color: severityColor(issue.severity)
                        }}
                    >
                        {kind === "lifecycle" ? "lifecycle" : issue.severity}
                    </span>
                    <span>{issue.message}</span>
                </div>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="overline">{label}</span>
            {links.map((link) => {
                const dangling = !link.exists && !link.title;
                return (
                    <button
                        key={`${label}-${link.id}`}
                        type="button"
                        className="reflink"
                        disabled={dangling}
                        style={
                            dangling
                                ? { opacity: 0.5, cursor: "default" }
                                : undefined
                        }
                        onClick={() => onOpen(link.id)}
                    >
                        <span className="reflink-id">{link.id}</span>
                        <span className="reflink-title">
                            {link.title || "Missing record"}
                        </span>
                        {link.relation || link.kind ? (
                            <span className="reflink-relation">
                                {link.relation || link.kind}
                            </span>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
}

function DialogError({ message }: { message: string }) {
    if (!message) return null;
    return (
        <div className="callout callout-error" style={{ margin: 0 }}>
            <span>{message}</span>
        </div>
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
        <AppDialog
            open
            title={`New ${collection?.singular || "record"}`}
            width={520}
            onClose={onClose}
            footer={
                <>
                    <button type="button" className="btn" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn-accent"
                        disabled={saving || !form.title.trim()}
                        onClick={() => void submit()}
                    >
                        {saving ? "Saving…" : "Create record"}
                    </button>
                </>
            }
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 10
                    }}
                >
                    <Field label="Collection">
                        <select
                            className="select"
                            value={form.collection}
                            onChange={(event) =>
                                changeCollection(event.target.value)
                            }
                        >
                            {schema.collections.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.id}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Status">
                        <select
                            className="select"
                            value={form.status}
                            onChange={(event) =>
                                update("status", event.target.value)
                            }
                        >
                            {(collection?.statuses || []).map((status) => (
                                <option key={status} value={status}>
                                    {status}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>
                <Field label="Title">
                    <input
                        className="input"
                        autoFocus
                        required
                        maxLength={120}
                        value={form.title}
                        onChange={(event) =>
                            update("title", event.target.value)
                        }
                    />
                </Field>
                {fields.category ||
                fields.confidence ||
                fields.severity ||
                fields.expires ? (
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 10
                        }}
                    >
                        {fields.category ? (
                            <Field label="Category">
                                <input
                                    className="input"
                                    value={form.category}
                                    onChange={(event) =>
                                        update("category", event.target.value)
                                    }
                                />
                            </Field>
                        ) : null}
                        {fields.confidence ? (
                            <Field label="Confidence">
                                <select
                                    className="select"
                                    value={form.confidence}
                                    onChange={(event) =>
                                        update("confidence", event.target.value)
                                    }
                                >
                                    <option value="">not set</option>
                                    {CONFIDENCES.map((value) => (
                                        <option key={value} value={value}>
                                            {value}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        ) : null}
                        {fields.severity ? (
                            <Field label="Severity">
                                <select
                                    className="select"
                                    value={form.severity}
                                    onChange={(event) =>
                                        update("severity", event.target.value)
                                    }
                                >
                                    <option value="">not set</option>
                                    {SEVERITIES.map((value) => (
                                        <option key={value} value={value}>
                                            {value}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        ) : null}
                        {fields.expires ? (
                            <Field label="Expires">
                                <input
                                    className="input"
                                    type="date"
                                    value={form.expires}
                                    onChange={(event) =>
                                        update("expires", event.target.value)
                                    }
                                />
                            </Field>
                        ) : null}
                    </div>
                ) : null}
                <Field label="Details">
                    <textarea
                        className="textarea"
                        rows={8}
                        value={form.body}
                        onChange={(event) => update("body", event.target.value)}
                    />
                </Field>
                <DialogError message={error} />
            </div>
        </AppDialog>
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
        <AppDialog
            open
            title={`Edit ${record.id}`}
            width={520}
            onClose={onClose}
            footer={
                <>
                    <button type="button" className="btn" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn-accent"
                        disabled={saving || !form.title.trim()}
                        onClick={() => void submit()}
                    >
                        {saving ? "Saving…" : "Save changes"}
                    </button>
                </>
            }
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Field label="Title">
                    <input
                        className="input"
                        autoFocus
                        required
                        maxLength={120}
                        value={form.title}
                        onChange={(event) =>
                            update("title", event.target.value)
                        }
                    />
                </Field>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 10
                    }}
                >
                    <Field label="Status">
                        <select
                            className="select"
                            value={form.status}
                            onChange={(event) =>
                                update("status", event.target.value)
                            }
                        >
                            {(statuses.includes(form.status)
                                ? statuses
                                : [form.status, ...statuses]
                            ).map((status) => (
                                <option key={status} value={status}>
                                    {status}
                                </option>
                            ))}
                        </select>
                    </Field>
                    {fields.category ? (
                        <Field label="Category">
                            <input
                                className="input"
                                value={form.category}
                                onChange={(event) =>
                                    update("category", event.target.value)
                                }
                            />
                        </Field>
                    ) : null}
                    {fields.confidence ? (
                        <Field label="Confidence">
                            <select
                                className="select"
                                value={form.confidence}
                                onChange={(event) =>
                                    update("confidence", event.target.value)
                                }
                            >
                                <option value="">not set</option>
                                {CONFIDENCES.map((value) => (
                                    <option key={value} value={value}>
                                        {value}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    ) : null}
                    {fields.severity ? (
                        <Field label="Severity">
                            <select
                                className="select"
                                value={form.severity}
                                onChange={(event) =>
                                    update("severity", event.target.value)
                                }
                            >
                                <option value="">not set</option>
                                {SEVERITIES.map((value) => (
                                    <option key={value} value={value}>
                                        {value}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    ) : null}
                    {fields.expires ? (
                        <Field label="Expires">
                            <input
                                className="input"
                                type="date"
                                value={form.expires}
                                onChange={(event) =>
                                    update("expires", event.target.value)
                                }
                            />
                        </Field>
                    ) : null}
                    {fields.review_after ? (
                        <Field label="Review after">
                            <input
                                className="input"
                                type="date"
                                value={form.review_after}
                                onChange={(event) =>
                                    update("review_after", event.target.value)
                                }
                            />
                        </Field>
                    ) : null}
                </div>
                <Field label="Details">
                    <textarea
                        className="textarea"
                        rows={10}
                        value={form.body}
                        onChange={(event) => update("body", event.target.value)}
                    />
                </Field>
                <DialogError message={error} />
            </div>
        </AppDialog>
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
        <AppDialog
            open
            title={`${mode === "graduate" ? "Graduate" : "Supersede"} ${record.id}`}
            width={420}
            onClose={onClose}
            footer={
                <>
                    <button type="button" className="btn" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn-accent"
                        disabled={saving || !value.trim()}
                        onClick={() => void submit()}
                    >
                        {saving ? "Saving…" : "Apply"}
                    </button>
                </>
            }
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Field
                    label={
                        mode === "graduate" ? "Target IDs" : "Replacement ID"
                    }
                >
                    <input
                        className="input"
                        autoFocus
                        placeholder={
                            mode === "graduate"
                                ? "CONV-0001, DOC-0004"
                                : "ADR-0009"
                        }
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                    />
                </Field>
                <DialogError message={error} />
            </div>
        </AppDialog>
    );
}

function DetailPanel({
    record,
    statuses,
    onClose,
    onOpenRelation,
    onOpenRecord,
    onUpdated
}: {
    record: MemoryRecord;
    statuses: string[];
    onClose: () => void;
    onOpenRelation: (id: string) => void;
    onOpenRecord: (id: string) => void;
    onUpdated: (record: MemoryRecord) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [lifecycle, setLifecycle] = useState<"" | "graduate" | "supersede">(
        ""
    );
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
    return (
        <div
            className="panel"
            style={{ flex: "0 0 380px", width: 380, overflow: "hidden" }}
        >
            <div className="panel-head">
                <span className="mono dim" style={{ fontSize: 11 }}>
                    {record.id}
                </span>
                <span className="mono faint" style={{ fontSize: 11 }}>
                    ·
                </span>
                <span className="mono dim" style={{ fontSize: 11 }}>
                    {record.collection}
                </span>
                <span className="mono faint" style={{ fontSize: 11 }}>
                    ·
                </span>
                <span
                    className="mono"
                    style={{
                        fontSize: 11,
                        color: recordStatusColor(record.status)
                    }}
                >
                    {record.status}
                </span>
                <span style={{ flex: 1 }} />
                <button
                    type="button"
                    className="iconbtn"
                    style={{ width: 22, height: 22, borderRadius: 6 }}
                    aria-label="Close details"
                    onClick={onClose}
                >
                    <X aria-hidden="true" />
                </button>
            </div>
            <div
                style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 14
                }}
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6
                    }}
                >
                    <h2
                        style={{
                            margin: 0,
                            fontSize: 17,
                            fontWeight: 600,
                            lineHeight: 1.3,
                            letterSpacing: "-0.01em",
                            textWrap: "pretty"
                        }}
                    >
                        {record.title}
                    </h2>
                    {record.path ? (
                        <span
                            className="mono faint"
                            style={{ fontSize: 10.5, wordBreak: "break-all" }}
                        >
                            {record.path}
                        </span>
                    ) : null}
                </div>
                <div className="metagrid">
                    {cells.map(([label, value, color]) => (
                        <span className="metacell" key={label}>
                            <span className="metacell-label">{label}</span>
                            <span
                                className="metacell-value"
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
                <MarkdownBody
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
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <button
                        type="button"
                        className="btn"
                        onClick={() => setEditing(true)}
                    >
                        <Pencil aria-hidden="true" />
                        Edit
                    </button>
                    {canGraduate ? (
                        <button
                            type="button"
                            className="btn"
                            onClick={() => setLifecycle("graduate")}
                        >
                            <GraduationCap aria-hidden="true" />
                            Graduate
                        </button>
                    ) : null}
                    {canSupersede ? (
                        <button
                            type="button"
                            className="btn"
                            onClick={() => setLifecycle("supersede")}
                        >
                            <Replace aria-hidden="true" />
                            Supersede
                        </button>
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
        </div>
    );
}

function collectionStatuses(
    collections: MemoryCollectionSchema[],
    collection: string
) {
    return collections.find((item) => item.id === collection)?.statuses || [];
}

export function MemoryView({
    selectedId,
    onSelect,
    onOpenRecord,
    schema
}: {
    selectedId: string | null;
    onSelect: (id: string) => void;
    onOpenRecord: (id: string) => void;
    schema: RuntimeSchema["memory"];
}) {
    const [records, setRecords] = useState<MemoryRecord[]>([]);
    const [query, setQuery] = useState("");
    const [collection, setCollection] = useState("");
    const [status, setStatus] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [createFor, setCreateFor] = useState<string | null>(null);

    const [reloadKey, setReloadKey] = useState(0);
    useWorkspaceChanges((change) => {
        if (changeTouches(change, "/memory/")) setReloadKey((key) => key + 1);
    });
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const response = await api.memory(query.trim(), {
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
        const timer = window.setTimeout(() => void load(), query ? 180 : 0);
        return () => window.clearTimeout(timer);
    }, [query, collection, status, reloadKey]);

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

    const active = sorted.find((record) => record.id === selectedId);
    const statuses = collection
        ? collectionStatuses(schema.collections, collection)
        : [...new Set(schema.collections.flatMap((item) => item.statuses))];
    const openRelation = (id: string) => {
        if (records.some((record) => record.id === id)) onSelect(id);
        else onOpenRecord(id);
    };
    const applyUpdate = (record: MemoryRecord) =>
        setRecords((current) =>
            current.map((item) => (item.id === record.id ? record : item))
        );

    return (
        <>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "14px 14px 0"
                }}
            >
                <input
                    className="input"
                    type="search"
                    aria-label="Search workfile memory"
                    placeholder="Search decisions, incidents, learnings…"
                    style={{ width: 260 }}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                />
                <ChipSelect
                    label="collection"
                    value={collection}
                    options={schema.collections.map((item) => ({
                        value: item.id
                    }))}
                    onChange={(next) => {
                        setCollection(next);
                        setStatus("");
                    }}
                />
                <ChipSelect
                    label="status"
                    value={status}
                    options={statuses.map((value) => ({
                        value,
                        color: recordStatusColor(value)
                    }))}
                    onChange={setStatus}
                />
                <span className="spacer" />
                <span className="mono faint" style={{ fontSize: 11 }}>
                    {loading ? "loading…" : plural(records.length, "record")}
                </span>
            </div>
            {error ? (
                <div className="callout callout-error">
                    <span>Memory could not be loaded: {error}</span>
                </div>
            ) : null}
            <div
                style={{
                    flex: 1,
                    display: "flex",
                    gap: 12,
                    padding: 14,
                    minHeight: 0,
                    overflow: "hidden"
                }}
            >
                <div
                    style={{
                        flex: 1,
                        display: "flex",
                        gap: 12,
                        overflowX: "auto",
                        minHeight: 0
                    }}
                >
                    {lanes.map((lane) => (
                        <div
                            key={lane.schema.id}
                            className="panel"
                            style={{ width: 272, flex: "0 0 272px" }}
                        >
                            <div className="panel-head">
                                <span
                                    className="mono"
                                    style={{
                                        fontSize: 11,
                                        color: "var(--accent)"
                                    }}
                                >
                                    {lane.schema.idPrefix}
                                </span>
                                <span
                                    style={{
                                        flex: 1,
                                        fontSize: 12.5,
                                        fontWeight: 600
                                    }}
                                >
                                    {capitalise(lane.schema.singular)}
                                </span>
                                <span
                                    className="mono faint"
                                    style={{ fontSize: 11 }}
                                >
                                    {lane.records.length}
                                </span>
                                {lane.schema.id !== "other" ? (
                                    <button
                                        type="button"
                                        className="iconbtn"
                                        style={{
                                            width: 22,
                                            height: 22,
                                            borderRadius: 6
                                        }}
                                        aria-label={`New ${lane.schema.singular}`}
                                        onClick={() =>
                                            setCreateFor(lane.schema.id)
                                        }
                                    >
                                        <Plus aria-hidden="true" />
                                    </button>
                                ) : null}
                            </div>
                            <div
                                style={{
                                    flex: 1,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 8,
                                    padding: 10,
                                    overflowY: "auto"
                                }}
                            >
                                {lane.records.map((record) => (
                                    <MemoryTile
                                        key={record.id}
                                        record={record}
                                        selected={record.id === selectedId}
                                        onSelect={() => onSelect(record.id)}
                                    />
                                ))}
                                {!lane.records.length && !loading ? (
                                    <span
                                        className="mono faint"
                                        style={{
                                            fontSize: 10.5,
                                            padding: "4px 2px"
                                        }}
                                    >
                                        no records
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>
                {active ? (
                    <DetailPanel
                        key={active.id}
                        record={active}
                        statuses={collectionStatuses(
                            schema.collections,
                            active.collection
                        )}
                        onClose={() => onSelect("")}
                        onOpenRelation={openRelation}
                        onOpenRecord={onOpenRecord}
                        onUpdated={applyUpdate}
                    />
                ) : null}
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
