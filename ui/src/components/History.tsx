import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { api } from "../api";
import { AppDialog, ChipSelect, Field } from "../kit";
import { changeTouches, useWorkspaceChanges } from "../store/live";
import { recordStatusColor, severityColor, statusColor } from "../theme";
import type {
    ChangeRecord,
    HistoryRecord,
    RecordLink,
    ReleasePreview,
    ReleaseRecord,
    RuntimeSchema
} from "../types";
import { MarkdownBody } from "./Markdown";

type ChangelogSchema = RuntimeSchema["changelog"];

/**
 * Fragment types wear card-status hues rather than colours of their own:
 * green for what landed, amber for what moved, red for what was taken away.
 * Releases read as accent — they are milestones, not lifecycle states.
 */
function changeTypeColor(type: string): string {
    switch (type) {
        case "added":
            return statusColor("done");
        case "changed":
            return statusColor("doing");
        case "fixed":
            return statusColor("review");
        case "removed":
            return statusColor("blocked");
        case "security":
            return severityColor("error");
        case "deprecated":
        case "internal":
        default:
            return statusColor("backlog");
    }
}

/** "next: 0.7.0 · semver" in the release callout — a hint, never a law. */
function nextVersionHint(
    releases: ReleaseRecord[],
    unpublished: ChangeRecord[]
): string {
    let best: [number, number, number] | null = null;
    for (const release of releases) {
        const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(release.version);
        if (!match) continue;
        const parsed: [number, number, number] = [
            Number(match[1]),
            Number(match[2]),
            Number(match[3])
        ];
        const delta = best
            ? parsed[0] - best[0] || parsed[1] - best[1] || parsed[2] - best[2]
            : 1;
        if (delta > 0) best = parsed;
    }
    if (!best) return "0.1.0";
    const feature = unpublished.some((fragment) =>
        ["added", "removed", "deprecated"].includes(fragment.type)
    );
    return feature
        ? `${best[0]}.${best[1] + 1}.0`
        : `${best[0]}.${best[1]}.${best[2] + 1}`;
}

const MONO = "var(--font-mono)" as const;

function errorText(reason: unknown): string {
    return reason instanceof Error ? reason.message : String(reason);
}

// ------------------------------------------------------------------ rail

function HistoryTile({
    record,
    selected,
    onSelect
}: {
    record: HistoryRecord;
    selected: boolean;
    onSelect: () => void;
}) {
    const type = record.kind === "release" ? "release" : record.type;
    const typeColor =
        record.kind === "release"
            ? "var(--accent)"
            : changeTypeColor(record.type);
    const right =
        record.kind === "release"
            ? `${record.fragments.length} fragment${
                  record.fragments.length === 1 ? "" : "s"
              } · ${record.date}`
            : record.area;
    return (
        <button
            type="button"
            className={selected ? "tile is-selected" : "tile"}
            aria-current={selected ? "true" : undefined}
            onClick={onSelect}
            style={{
                gap: 4,
                background: selected ? "var(--accent-soft)" : "var(--surface)"
            }}
        >
            <span className="tile-row">
                <span className="mono dim" style={{ fontSize: 11 }}>
                    {record.id}
                </span>
                <span
                    className="mono"
                    style={{ fontSize: 10, color: typeColor }}
                >
                    {type}
                </span>
                <span style={{ flex: 1 }} />
                <span
                    className="mono faint truncate"
                    style={{ fontSize: 10, maxWidth: 170 }}
                >
                    {right}
                </span>
            </span>
            <span className="tile-title" style={{ fontWeight: 400 }}>
                {record.title}
            </span>
        </button>
    );
}

function RailGroup({
    label,
    records,
    selectedId,
    onSelect
}: {
    label: string;
    records: HistoryRecord[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}) {
    if (!records.length) return null;
    return (
        <div
            role="group"
            aria-label={label}
            style={{
                paddingTop: 16,
                display: "flex",
                flexDirection: "column",
                gap: 6
            }}
        >
            <span className="overline">
                {label} · {records.length}
            </span>
            {records.map((record) => (
                <HistoryTile
                    key={record.id}
                    record={record}
                    selected={record.id === selectedId}
                    onSelect={() => onSelect(record.id)}
                />
            ))}
        </div>
    );
}

// ---------------------------------------------------------------- reflinks

function RefRow({
    id,
    title,
    relation,
    disabled,
    onOpen
}: {
    id: string;
    title: string;
    relation?: string;
    disabled?: boolean;
    onOpen: () => void;
}) {
    return (
        <button
            type="button"
            className="reflink"
            disabled={disabled}
            onClick={onOpen}
            style={disabled ? { opacity: 0.55, cursor: "default" } : undefined}
        >
            <span className="reflink-id">{id}</span>
            <span className="reflink-title">{title}</span>
            {relation ? (
                <span className="reflink-relation">{relation}</span>
            ) : null}
        </button>
    );
}

function RefGroup({
    label,
    links,
    onOpen
}: {
    label: string;
    links: Array<{
        id: string;
        title: string;
        relation?: string;
        disabled?: boolean;
    }>;
    onOpen: (id: string) => void;
}) {
    if (!links.length) return null;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span className="overline">{label}</span>
            {links.map((link) => (
                <RefRow
                    key={`${label}-${link.id}`}
                    id={link.id}
                    title={link.title}
                    relation={link.relation}
                    disabled={link.disabled}
                    onOpen={() => onOpen(link.id)}
                />
            ))}
        </div>
    );
}

function fromRecordLinks(links: RecordLink[]) {
    return links.map((link) => ({
        id: link.id,
        title: link.title || "Missing record",
        relation: link.relation,
        // A dangling reference has nowhere to go; it still shows, dimmed.
        disabled: !link.exists && !link.title
    }));
}

// ----------------------------------------------------------------- dialogs

function NewFragmentDialog({
    schema,
    areas,
    onClose,
    onCreated
}: {
    schema: ChangelogSchema;
    areas: string[];
    onClose: () => void;
    onCreated: (record: ChangeRecord) => void;
}) {
    const [form, setForm] = useState({
        title: "",
        type: schema.defaults.type,
        area: areas[0] || "general",
        visibility: schema.defaults.visibility,
        body: ""
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const update = (key: keyof typeof form, value: string) =>
        setForm((current) => ({ ...current, [key]: value }));
    const submit = async () => {
        setSaving(true);
        try {
            const result = await api.createChange(form);
            onCreated(result.record);
        } catch (reason) {
            setError(errorText(reason));
        } finally {
            setSaving(false);
        }
    };
    return (
        <AppDialog
            title="New change fragment"
            open
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
                        {saving ? "Saving…" : "Create fragment"}
                    </button>
                </>
            }
        >
            <p
                className="dim"
                style={{ margin: 0, fontSize: 12.5 }}
            >
                Record one user- or operator-meaningful change.
            </p>
            <Field label="Title">
                <input
                    className="input"
                    autoFocus
                    required
                    maxLength={120}
                    value={form.title}
                    onChange={(event) => update("title", event.target.value)}
                />
            </Field>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 10
                }}
            >
                <Field label="Type">
                    <select
                        className="select"
                        value={form.type}
                        onChange={(event) =>
                            update("type", event.target.value)
                        }
                    >
                        {schema.types.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Area">
                    <select
                        className="select"
                        value={form.area}
                        onChange={(event) =>
                            update("area", event.target.value)
                        }
                    >
                        {areas.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Visibility">
                    <select
                        className="select"
                        value={form.visibility}
                        onChange={(event) =>
                            update("visibility", event.target.value)
                        }
                    >
                        {schema.visibilities.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                </Field>
            </div>
            <Field label="Details">
                <textarea
                    className="textarea"
                    rows={5}
                    value={form.body}
                    onChange={(event) => update("body", event.target.value)}
                />
            </Field>
            {error ? (
                <div
                    className="callout callout-error"
                    style={{ margin: 0 }}
                    aria-live="polite"
                >
                    {error}
                </div>
            ) : null}
        </AppDialog>
    );
}

function ReleaseDialog({
    preview,
    suggestedVersion,
    onClose,
    onReleased
}: {
    preview: ReleasePreview;
    suggestedVersion: string;
    onClose: () => void;
    onReleased: () => void;
}) {
    const [version, setVersion] = useState(suggestedVersion);
    const [title, setTitle] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const release = async () => {
        setSaving(true);
        try {
            await api.createRelease({
                version,
                title: title || undefined,
                fragmentIds: preview.fragments.map((fragment) => fragment.id)
            });
            onReleased();
        } catch (reason) {
            setError(errorText(reason));
        } finally {
            setSaving(false);
        }
    };
    return (
        <AppDialog
            title="Release preparation"
            open
            onClose={onClose}
            width={640}
            footer={
                <>
                    <button type="button" className="btn" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn-accent"
                        disabled={
                            saving ||
                            !version.trim() ||
                            !preview.fragments.length
                        }
                        onClick={() => void release()}
                    >
                        {saving ? "Releasing…" : "Create release"}
                    </button>
                </>
            }
        >
            <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>
                {preview.fragments.length} unreleased fragment
                {preview.fragments.length === 1 ? "" : "s"} selected.
            </p>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "150px 1fr",
                    gap: 10
                }}
            >
                <Field label="Version">
                    <input
                        className="input mono"
                        placeholder="2.4.0"
                        value={version}
                        onChange={(event) => setVersion(event.target.value)}
                    />
                </Field>
                <Field label="Release title">
                    <input
                        className="input"
                        placeholder="Optional curated title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                    />
                </Field>
            </div>
            {preview.groups.map((group) => (
                <div
                    key={group.type}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 5
                    }}
                >
                    <span
                        className="overline"
                        style={{ color: changeTypeColor(group.type) }}
                    >
                        {group.type} · {group.fragments.length}
                    </span>
                    {group.fragments.map((fragment) => (
                        <span
                            key={fragment.id}
                            style={{
                                display: "flex",
                                alignItems: "baseline",
                                gap: 9,
                                fontSize: 12.5
                            }}
                        >
                            <span
                                className="mono dim"
                                style={{ fontSize: 11, flex: "0 0 auto" }}
                            >
                                {fragment.id}
                            </span>
                            <span className="truncate">{fragment.title}</span>
                            <span style={{ flex: 1 }} />
                            <span
                                className="mono faint"
                                style={{ fontSize: 10 }}
                            >
                                {fragment.area}
                            </span>
                        </span>
                    ))}
                </div>
            ))}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span className="overline">release notes preview</span>
                <div
                    style={{
                        border: "1px solid var(--line)",
                        borderRadius: 7,
                        background: "var(--bg)",
                        padding: "4px 12px",
                        maxHeight: 220,
                        overflowY: "auto"
                    }}
                >
                    <MarkdownBody
                        source={
                            preview.markdown || "No release notes to render."
                        }
                    />
                </div>
            </div>
            {error ? (
                <div
                    className="callout callout-error"
                    style={{ margin: 0 }}
                    aria-live="polite"
                >
                    {error}
                </div>
            ) : null}
        </AppDialog>
    );
}

// ------------------------------------------------------------------ editor

function FragmentEditor({
    record,
    schema,
    areas,
    onSaved
}: {
    record: ChangeRecord;
    schema: ChangelogSchema;
    areas: string[];
    onSaved: (record: ChangeRecord) => void;
}) {
    const [form, setForm] = useState({
        title: record.title,
        type: record.type,
        area: record.area,
        visibility: record.visibility
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const update = (key: keyof typeof form, value: string) =>
        setForm((current) => ({ ...current, [key]: value }));
    const changes: Record<string, string> = {};
    for (const key of ["title", "type", "area", "visibility"] as const) {
        if (form[key] !== record[key]) changes[key] = form[key];
    }
    const dirty = Object.keys(changes).length > 0;
    // A fragment can live in an area the card schema no longer lists.
    const areaOptions = areas.includes(record.area)
        ? areas
        : [record.area, ...areas];
    const save = async () => {
        setSaving(true);
        try {
            const result = await api.patchChange(
                record.id,
                changes,
                record.revision
            );
            setError("");
            onSaved(result.record);
        } catch (reason) {
            setError(errorText(reason));
        } finally {
            setSaving(false);
        }
    };
    return (
        <div
            style={{
                border: "1px solid var(--line)",
                borderRadius: 8,
                background: "var(--surface)",
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 10
            }}
        >
            <span className="overline">edit fragment</span>
            <Field label="Title">
                <input
                    className="input"
                    maxLength={120}
                    value={form.title}
                    onChange={(event) => update("title", event.target.value)}
                />
            </Field>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 10
                }}
            >
                <Field label="Type">
                    <select
                        className="select"
                        value={form.type}
                        onChange={(event) =>
                            update("type", event.target.value)
                        }
                    >
                        {schema.types.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Area">
                    <select
                        className="select"
                        value={form.area}
                        onChange={(event) =>
                            update("area", event.target.value)
                        }
                    >
                        {areaOptions.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Visibility">
                    <select
                        className="select"
                        value={form.visibility}
                        onChange={(event) =>
                            update("visibility", event.target.value)
                        }
                    >
                        {schema.visibilities.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                </Field>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {error ? (
                    <span
                        style={{
                            fontSize: 12,
                            color: "var(--sev-error)",
                            flex: 1
                        }}
                        aria-live="polite"
                    >
                        {error}
                    </span>
                ) : (
                    <span style={{ flex: 1 }} />
                )}
                <button
                    type="button"
                    className="btn"
                    disabled={saving || !dirty || !form.title.trim()}
                    onClick={() => void save()}
                >
                    {saving ? "Saving…" : "Save changes"}
                </button>
            </div>
        </div>
    );
}

// -------------------------------------------------------------------- view

export function HistoryView({
    selectedId,
    onSelect,
    onOpenRecord,
    schema,
    areas
}: {
    selectedId: string | null;
    onSelect: (id: string) => void;
    onOpenRecord: (id: string) => void;
    schema: ChangelogSchema;
    areas: string[];
}) {
    const [records, setRecords] = useState<HistoryRecord[]>([]);
    const [query, setQuery] = useState("");
    const [state, setState] = useState("");
    const [visibility, setVisibility] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [actionError, setActionError] = useState("");
    const [showCreate, setShowCreate] = useState(false);
    const [preview, setPreview] = useState<ReleasePreview | null>(null);
    const [renderVisibility, setRenderVisibility] = useState("public");
    const [rendered, setRendered] = useState({
        content: "",
        error: "",
        loading: true
    });

    const [reloadKey, setReloadKey] = useState(0);
    const reload = () => setReloadKey((key) => key + 1);
    useWorkspaceChanges((change) => {
        if (changeTouches(change, "/changelog/")) reload();
    });

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            setLoading(true);
            try {
                const response = await api.changelog(query.trim(), {
                    state: state || undefined,
                    visibility: visibility || undefined
                });
                if (cancelled) return;
                setRecords(response.records);
                setError("");
            } catch (reason) {
                if (!cancelled) setError(errorText(reason));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        const timer = window.setTimeout(() => void run(), query ? 180 : 0);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [query, state, visibility, reloadKey]);

    // The derived changelog is the pane's resting state, so it stays warm.
    useEffect(() => {
        let cancelled = false;
        setRendered((current) => ({ ...current, loading: true }));
        api.renderedChangelog(renderVisibility)
            .then((result) => {
                if (!cancelled)
                    setRendered({
                        content: result.content,
                        error: "",
                        loading: false
                    });
            })
            .catch((reason: unknown) => {
                if (!cancelled)
                    setRendered({
                        content: "",
                        error: errorText(reason),
                        loading: false
                    });
            });
        return () => {
            cancelled = true;
        };
    }, [renderVisibility, reloadKey]);

    const sorted = useMemo(
        () =>
            [...records].sort((left, right) => {
                if (left.kind !== right.kind)
                    return left.kind === "change" ? -1 : 1;
                if (left.kind === "release" && right.kind === "release")
                    return right.date.localeCompare(left.date);
                return String(right.updated || "").localeCompare(
                    String(left.updated || "")
                );
            }),
        [records]
    );
    const recordById = useMemo(
        () => new Map(records.map((record) => [record.id, record])),
        [records]
    );
    const unpublished = useMemo(
        () =>
            sorted.filter(
                (record): record is ChangeRecord =>
                    record.kind === "change" && !record.released
            ),
        [sorted]
    );
    const published = useMemo(
        () =>
            sorted.filter(
                (record) => record.kind === "change" && record.released
            ),
        [sorted]
    );
    const releases = useMemo(
        () =>
            sorted.filter(
                (record): record is ReleaseRecord => record.kind === "release"
            ),
        [sorted]
    );
    const suggestedVersion = useMemo(
        () => nextVersionHint(releases, unpublished),
        [releases, unpublished]
    );
    const active = selectedId ? recordById.get(selectedId) : undefined;

    const openRelation = (id: string) => {
        if (recordById.has(id)) {
            onSelect(id);
            return;
        }
        // A fragment shipped in an older release falls outside the active
        // filters; widen them instead of dead-ending on a missing record.
        if (/^(CHG|REL)-/.test(id)) {
            setState("");
            setVisibility("");
            onSelect(id);
            return;
        }
        onOpenRecord(id);
    };

    const prepareRelease = () => {
        setActionError("");
        api.releasePreview()
            .then(setPreview)
            .catch((reason: unknown) => setActionError(errorText(reason)));
    };

    const worstIssue = active?.issues.some(
        (issue) => issue.severity === "error"
    )
        ? "callout callout-error"
        : "callout";

    const newFragmentButton = (
        <button
            type="button"
            className="btn"
            onClick={() => setShowCreate(true)}
        >
            <Plus aria-hidden="true" />
            New fragment
        </button>
    );

    return (
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
            {/* ------------------------------------------------ left rail */}
            <div
                style={{
                    width: 400,
                    flex: "0 0 400px",
                    borderRight: "1px solid var(--line)",
                    overflowY: "auto",
                    padding: 14
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "11px 12px",
                        border: "1px solid var(--accent)",
                        borderRadius: 8,
                        background: "var(--accent-soft)"
                    }}
                >
                    <span
                        style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            gap: 2
                        }}
                    >
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                            {unpublished.length} unpublished fragment
                            {unpublished.length === 1 ? "" : "s"}
                        </span>
                        <span
                            style={{
                                fontFamily: MONO,
                                fontSize: 10.5,
                                color: "var(--fg-2)"
                            }}
                        >
                            next: {suggestedVersion} ·{" "}
                            {schema.releaseStrategy}
                        </span>
                    </span>
                    <button
                        type="button"
                        onClick={prepareRelease}
                        style={{
                            height: 28,
                            padding: "0 10px",
                            border: 0,
                            borderRadius: 6,
                            background: "var(--accent)",
                            color: "var(--accent-fg)",
                            font: "inherit",
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: "pointer",
                            whiteSpace: "nowrap"
                        }}
                    >
                        Prepare release
                    </button>
                </div>

                {actionError ? (
                    <div
                        className="callout callout-error"
                        style={{ margin: "10px 0 0" }}
                        aria-live="polite"
                    >
                        {actionError}
                    </div>
                ) : null}

                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        paddingTop: 12
                    }}
                >
                    <input
                        className="input"
                        type="search"
                        aria-label="Search history"
                        placeholder="Search fragments and releases…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        style={{ flex: 1, height: 26, fontSize: 12 }}
                    />
                    <ChipSelect
                        label="state"
                        value={state}
                        options={[
                            { value: "unreleased" },
                            { value: "released" }
                        ]}
                        onChange={setState}
                    />
                    <ChipSelect
                        label="visibility"
                        value={visibility}
                        options={schema.visibilities.map((value) => ({
                            value
                        }))}
                        onChange={setVisibility}
                    />
                </div>

                {loading ? (
                    <div
                        aria-busy="true"
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            paddingTop: 16
                        }}
                    >
                        {Array.from({ length: 6 }, (_, index) => (
                            <span
                                key={index}
                                style={{
                                    height: 52,
                                    borderRadius: 7,
                                    background: "var(--line-2)"
                                }}
                            />
                        ))}
                    </div>
                ) : error ? (
                    <div
                        className="callout callout-error"
                        style={{ margin: "16px 0 0" }}
                        aria-live="polite"
                    >
                        {error}
                    </div>
                ) : !sorted.length ? (
                    <p
                        className="faint"
                        style={{ margin: 0, paddingTop: 16, fontSize: 12.5 }}
                    >
                        No history records match the filters.
                    </p>
                ) : (
                    <>
                        <RailGroup
                            label="unpublished"
                            records={unpublished}
                            selectedId={selectedId}
                            onSelect={onSelect}
                        />
                        <RailGroup
                            label="releases"
                            records={releases}
                            selectedId={selectedId}
                            onSelect={onSelect}
                        />
                        <RailGroup
                            label="published fragments"
                            records={published}
                            selectedId={selectedId}
                            onSelect={onSelect}
                        />
                    </>
                )}
            </div>

            {/* ----------------------------------------------- right pane */}
            <div
                style={{
                    flex: 1,
                    minWidth: 0,
                    overflowY: "auto",
                    padding: "20px 24px"
                }}
            >
                {active ? (
                    <>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                fontFamily: MONO,
                                fontSize: 11
                            }}
                        >
                            <span style={{ color: "var(--accent)" }}>
                                {active.id}
                            </span>
                            <span className="faint">·</span>
                            <span className="faint">{active.kind}</span>
                            <span className="faint">·</span>
                            {active.kind === "change" ? (
                                <>
                                    <span
                                        style={{
                                            color: changeTypeColor(
                                                active.type
                                            )
                                        }}
                                    >
                                        {active.type}
                                    </span>
                                    <span className="faint">·</span>
                                    <span className="dim">{active.area}</span>
                                    <span className="faint">·</span>
                                    <span className="dim">
                                        {active.visibility}
                                    </span>
                                    <span className="faint">·</span>
                                    <span
                                        style={{
                                            color: recordStatusColor(
                                                active.released
                                                    ? "released"
                                                    : "unreleased"
                                            )
                                        }}
                                    >
                                        {active.released
                                            ? "released"
                                            : "unreleased"}
                                    </span>
                                    {active.updated ? (
                                        <>
                                            <span className="faint">·</span>
                                            <span className="faint">
                                                {active.updated}
                                            </span>
                                        </>
                                    ) : null}
                                </>
                            ) : (
                                <>
                                    <span style={{ color: "var(--accent)" }}>
                                        {active.version}
                                    </span>
                                    <span className="faint">·</span>
                                    <span className="dim">{active.date}</span>
                                    {active.commit ? (
                                        <>
                                            <span className="faint">·</span>
                                            <span className="faint">
                                                {active.commit}
                                            </span>
                                        </>
                                    ) : null}
                                    <span className="faint">·</span>
                                    <span className="faint">
                                        {active.fragments.length} fragment
                                        {active.fragments.length === 1
                                            ? ""
                                            : "s"}
                                    </span>
                                </>
                            )}
                            <span style={{ flex: 1 }} />
                            {newFragmentButton}
                            <button
                                type="button"
                                className="iconbtn"
                                aria-label="Close record"
                                title="Back to the derived changelog"
                                onClick={() => onSelect("")}
                            >
                                <X aria-hidden="true" />
                            </button>
                        </div>

                        <h2
                            style={{
                                margin: "10px 0 4px",
                                fontSize: 26,
                                fontWeight: 600,
                                letterSpacing: "-0.02em",
                                lineHeight: 1.25,
                                textWrap: "pretty"
                            }}
                        >
                            {active.title}
                        </h2>
                        <div
                            className="mono faint"
                            style={{
                                fontSize: 10.5,
                                wordBreak: "break-all"
                            }}
                        >
                            {active.path}
                        </div>

                        {active.issues.length > 0 ? (
                            <div
                                className={worstIssue}
                                style={{
                                    margin: "14px 0 0",
                                    flexDirection: "column",
                                    alignItems: "stretch",
                                    gap: 4
                                }}
                            >
                                {active.issues.map((issue) => (
                                    <span
                                        key={`${issue.code}-${issue.message}`}
                                        style={{
                                            display: "flex",
                                            alignItems: "baseline",
                                            gap: 8
                                        }}
                                    >
                                        <span
                                            className="mono"
                                            style={{
                                                fontSize: 10.5,
                                                color: severityColor(
                                                    issue.severity
                                                ),
                                                flex: "0 0 auto"
                                            }}
                                        >
                                            {issue.severity}
                                        </span>
                                        <span>{issue.message}</span>
                                    </span>
                                ))}
                            </div>
                        ) : null}

                        <div style={{ maxWidth: "70ch", marginTop: 18 }}>
                            <MarkdownBody
                                source={
                                    active.body || "No additional notes."
                                }
                                onOpen={openRelation}
                            />
                        </div>

                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 14,
                                marginTop: 22,
                                maxWidth: "70ch"
                            }}
                        >
                            {active.kind === "change" ? (
                                <RefGroup
                                    label="shipped in"
                                    links={(active.releaseIds || []).map(
                                        (id) => ({
                                            id,
                                            title:
                                                recordById.get(id)?.title ||
                                                "Open release",
                                            relation: "release"
                                        })
                                    )}
                                    onOpen={openRelation}
                                />
                            ) : (
                                <RefGroup
                                    label={`fragments · ${active.fragments.length}`}
                                    links={active.fragments.map((id) => {
                                        const fragment = recordById.get(id);
                                        return {
                                            id,
                                            title:
                                                fragment?.title ||
                                                "Open fragment",
                                            relation:
                                                fragment?.kind === "change"
                                                    ? fragment.type
                                                    : undefined
                                        };
                                    })}
                                    onOpen={openRelation}
                                />
                            )}
                            <RefGroup
                                label="links to"
                                links={fromRecordLinks(active.outgoing)}
                                onOpen={openRelation}
                            />
                            <RefGroup
                                label="backlinks"
                                links={fromRecordLinks(active.incoming)}
                                onOpen={openRelation}
                            />
                        </div>

                        {active.kind === "change" ? (
                            <div
                                style={{ marginTop: 22, maxWidth: "70ch" }}
                            >
                                <FragmentEditor
                                    key={`${active.id}:${active.revision}`}
                                    record={active}
                                    schema={schema}
                                    areas={areas}
                                    onSaved={(saved) =>
                                        setRecords((current) =>
                                            current.map((record) =>
                                                record.id === saved.id
                                                    ? saved
                                                    : record
                                            )
                                        )
                                    }
                                />
                            </div>
                        ) : null}
                    </>
                ) : (
                    <>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                paddingBottom: 12,
                                borderBottom: "1px solid var(--line)"
                            }}
                        >
                            <span style={{ fontSize: 13, fontWeight: 600 }}>
                                Derived changelog
                            </span>
                            <span
                                className="mono dim"
                                style={{ fontSize: 11 }}
                            >
                                visibility {renderVisibility} · CHANGELOG.md
                            </span>
                            <span style={{ flex: 1 }} />
                            {schema.visibilities.map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    className={
                                        renderVisibility === value
                                            ? "chip is-on"
                                            : "chip"
                                    }
                                    aria-pressed={renderVisibility === value}
                                    onClick={() => setRenderVisibility(value)}
                                >
                                    {value}
                                </button>
                            ))}
                            <span
                                className="mono faint"
                                style={{
                                    fontSize: 10.5,
                                    border: "1px solid var(--line)",
                                    borderRadius: 5,
                                    padding: "2px 7px",
                                    whiteSpace: "nowrap"
                                }}
                            >
                                render --write
                            </span>
                            {newFragmentButton}
                        </div>
                        {rendered.error ? (
                            <div
                                className="callout callout-error"
                                style={{ margin: "16px 0 0" }}
                                aria-live="polite"
                            >
                                {rendered.error}
                            </div>
                        ) : (
                            <pre
                                style={{
                                    margin: "16px 0 0",
                                    fontFamily: MONO,
                                    fontSize: 12,
                                    lineHeight: 1.75,
                                    color: "var(--fg-2)",
                                    whiteSpace: "pre-wrap"
                                }}
                                aria-busy={rendered.loading || undefined}
                            >
                                {rendered.loading && !rendered.content
                                    ? "Rendering…"
                                    : rendered.content ||
                                      "Nothing to render yet — create the first change fragment."}
                            </pre>
                        )}
                    </>
                )}
            </div>

            {showCreate ? (
                <NewFragmentDialog
                    schema={schema}
                    areas={areas}
                    onClose={() => setShowCreate(false)}
                    onCreated={(record) => {
                        setShowCreate(false);
                        setRecords((current) => [record, ...current]);
                        onSelect(record.id);
                    }}
                />
            ) : null}
            {preview ? (
                <ReleaseDialog
                    preview={preview}
                    suggestedVersion={suggestedVersion}
                    onClose={() => setPreview(null)}
                    onReleased={() => {
                        setPreview(null);
                        reload();
                    }}
                />
            ) : null}
        </div>
    );
}
