import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, Plus, X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item } from "@/components/ui/item";
import {
    NativeSelect,
    NativeSelectOption
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { api } from "../api";
import { READING_MEASURE } from "../layout";
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

/** The small-caps section label the bespoke `.overline` used to carry. */
const OVERLINE =
    "text-[10px] font-medium tracking-widest uppercase text-muted-foreground";

/**
 * Fragment types wear card-status hues rather than colours of their own:
 * green for what landed, amber for what moved, red for what was taken away.
 * Releases read as primary — they are milestones, not lifecycle states.
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

function errorText(reason: unknown): string {
    return reason instanceof Error ? reason.message : String(reason);
}

/**
 * A filter chip that opens a menu — kit's ChipSelect rebuilt on the registry:
 * an outline Button trigger over a DropdownMenu. The empty value means "all",
 * renders dimmed and drops the active tint.
 */
function FilterChip({
    label,
    value,
    options,
    onChange
}: {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={label}
                    className={cn(
                        "h-7 gap-1 px-2 text-xs",
                        value && "border-ring bg-accent"
                    )}
                >
                    {label}
                    <span
                        className={cn(
                            "font-normal",
                            !value && "text-muted-foreground"
                        )}
                    >
                        {value || "all"}
                    </span>
                    <ChevronDown
                        aria-hidden="true"
                        className="size-3 text-muted-foreground"
                    />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
                <DropdownMenuCheckboxItem
                    checked={!value}
                    onSelect={() => onChange("")}
                >
                    all
                </DropdownMenuCheckboxItem>
                {options.map((option) => (
                    <DropdownMenuCheckboxItem
                        key={option}
                        checked={value === option}
                        onSelect={() => onChange(option)}
                    >
                        {option}
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
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
            ? "var(--primary)"
            : changeTypeColor(record.type);
    const right =
        record.kind === "release"
            ? `${record.fragments.length} fragment${
                  record.fragments.length === 1 ? "" : "s"
              } · ${record.date}`
            : record.area;
    return (
        <Item asChild variant="outline" size="sm">
            <button
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={onSelect}
                className={cn(
                    "flex-col flex-nowrap items-stretch gap-1 px-2.5 py-2 text-left shadow-xs",
                    selected
                        ? "border-ring bg-accent"
                        : "bg-card hover:border-ring"
                )}
            >
                <span className="flex items-baseline gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                        {record.id}
                    </span>
                    <span
                        className="font-mono text-[10px]"
                        style={{ color: typeColor }}
                    >
                        {type}
                    </span>
                    <span className="flex-1" />
                    <span className="max-w-[170px] truncate font-mono text-[10px] text-muted-foreground/70">
                        {right}
                    </span>
                </span>
                <span className="text-sm leading-snug font-normal">
                    {record.title}
                </span>
            </button>
        </Item>
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
        <div role="group" aria-label={label} className="flex flex-col gap-1.5 pt-4">
            <span className={OVERLINE}>
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
        <Item asChild variant="outline" size="sm">
            <button
                type="button"
                disabled={disabled}
                onClick={onOpen}
                className="flex-nowrap gap-2 bg-card px-2.5 py-1.5 text-left shadow-xs hover:border-ring disabled:pointer-events-none disabled:opacity-55"
            >
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {id}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px]">
                    {title}
                </span>
                {relation ? (
                    <Badge
                        variant="outline"
                        className="shrink-0 font-mono text-[10px] font-normal text-muted-foreground"
                    >
                        {relation}
                    </Badge>
                ) : null}
            </button>
        </Item>
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
        <div className="flex flex-col gap-2">
            <span className={OVERLINE}>{label}</span>
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
        <Dialog
            open
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            {/* The title input owns first focus, not Radix's close button. */}
            <DialogContent onOpenAutoFocus={(event) => event.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>New change fragment</DialogTitle>
                    <DialogDescription>
                        Record one user- or operator-meaningful change.
                    </DialogDescription>
                </DialogHeader>
                <Field>
                    <FieldLabel htmlFor="new-fragment-title">Title</FieldLabel>
                    <Input
                        id="new-fragment-title"
                        autoFocus
                        required
                        maxLength={120}
                        value={form.title}
                        onChange={(event) =>
                            update("title", event.target.value)
                        }
                    />
                </Field>
                <div className="grid grid-cols-3 gap-2.5">
                    <Field>
                        <FieldLabel htmlFor="new-fragment-type">
                            Type
                        </FieldLabel>
                        <NativeSelect
                            id="new-fragment-type"
                            value={form.type}
                            onChange={(event) =>
                                update("type", event.target.value)
                            }
                        >
                            {schema.types.map((value) => (
                                <NativeSelectOption key={value} value={value}>
                                    {value}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="new-fragment-area">
                            Area
                        </FieldLabel>
                        <NativeSelect
                            id="new-fragment-area"
                            value={form.area}
                            onChange={(event) =>
                                update("area", event.target.value)
                            }
                        >
                            {areas.map((value) => (
                                <NativeSelectOption key={value} value={value}>
                                    {value}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="new-fragment-visibility">
                            Visibility
                        </FieldLabel>
                        <NativeSelect
                            id="new-fragment-visibility"
                            value={form.visibility}
                            onChange={(event) =>
                                update("visibility", event.target.value)
                            }
                        >
                            {schema.visibilities.map((value) => (
                                <NativeSelectOption key={value} value={value}>
                                    {value}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </Field>
                </div>
                <Field>
                    <FieldLabel htmlFor="new-fragment-details">
                        Details
                    </FieldLabel>
                    <Textarea
                        id="new-fragment-details"
                        rows={5}
                        value={form.body}
                        onChange={(event) => update("body", event.target.value)}
                    />
                </Field>
                {error ? (
                    <Alert variant="destructive" aria-live="polite">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={saving || !form.title.trim()}
                        onClick={() => void submit()}
                    >
                        {saving ? "Saving…" : "Create fragment"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
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
        <Dialog
            open
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[640px]">
                <DialogHeader>
                    <DialogTitle>Release preparation</DialogTitle>
                    <DialogDescription>
                        {preview.fragments.length} unreleased fragment
                        {preview.fragments.length === 1 ? "" : "s"} selected.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
                    <div className="grid grid-cols-[150px_1fr] gap-2.5">
                        <Field>
                            <FieldLabel htmlFor="release-version">
                                Version
                            </FieldLabel>
                            <Input
                                id="release-version"
                                className="font-mono"
                                placeholder="2.4.0"
                                value={version}
                                onChange={(event) =>
                                    setVersion(event.target.value)
                                }
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="release-title">
                                Release title
                            </FieldLabel>
                            <Input
                                id="release-title"
                                placeholder="Optional curated title"
                                value={title}
                                onChange={(event) =>
                                    setTitle(event.target.value)
                                }
                            />
                        </Field>
                    </div>
                    {preview.groups.map((group) => (
                        <div key={group.type} className="flex flex-col gap-1.5">
                            <span
                                className={OVERLINE}
                                style={{ color: changeTypeColor(group.type) }}
                            >
                                {group.type} · {group.fragments.length}
                            </span>
                            {group.fragments.map((fragment) => (
                                <span
                                    key={fragment.id}
                                    className="flex items-baseline gap-2 text-[12.5px]"
                                >
                                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                                        {fragment.id}
                                    </span>
                                    <span className="min-w-0 truncate">
                                        {fragment.title}
                                    </span>
                                    <span className="flex-1" />
                                    <span className="font-mono text-[10px] text-muted-foreground/70">
                                        {fragment.area}
                                    </span>
                                </span>
                            ))}
                        </div>
                    ))}
                    <div className="flex flex-col gap-1.5">
                        <span className={OVERLINE}>release notes preview</span>
                        {/* MarkdownBody brings its own .typeset wrapper. */}
                        <div className="max-h-[220px] overflow-y-auto rounded-md border bg-background px-3 py-1">
                            <MarkdownBody
                                source={
                                    preview.markdown ||
                                    "No release notes to render."
                                }
                            />
                        </div>
                    </div>
                    {error ? (
                        <Alert variant="destructive" aria-live="polite">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    ) : null}
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={
                            saving ||
                            !version.trim() ||
                            !preview.fragments.length
                        }
                        onClick={() => void release()}
                    >
                        {saving ? "Releasing…" : "Create release"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
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
        <Card className="gap-2.5 rounded-lg py-3 shadow-xs">
            <CardHeader className="px-3">
                <CardTitle className={OVERLINE}>edit fragment</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 px-3">
                <Field>
                    <FieldLabel htmlFor="edit-fragment-title">
                        Title
                    </FieldLabel>
                    <Input
                        id="edit-fragment-title"
                        maxLength={120}
                        value={form.title}
                        onChange={(event) =>
                            update("title", event.target.value)
                        }
                    />
                </Field>
                <div className="grid grid-cols-3 gap-2.5">
                    <Field>
                        <FieldLabel htmlFor="edit-fragment-type">
                            Type
                        </FieldLabel>
                        <NativeSelect
                            id="edit-fragment-type"
                            value={form.type}
                            onChange={(event) =>
                                update("type", event.target.value)
                            }
                        >
                            {schema.types.map((value) => (
                                <NativeSelectOption key={value} value={value}>
                                    {value}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="edit-fragment-area">
                            Area
                        </FieldLabel>
                        <NativeSelect
                            id="edit-fragment-area"
                            value={form.area}
                            onChange={(event) =>
                                update("area", event.target.value)
                            }
                        >
                            {areaOptions.map((value) => (
                                <NativeSelectOption key={value} value={value}>
                                    {value}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="edit-fragment-visibility">
                            Visibility
                        </FieldLabel>
                        <NativeSelect
                            id="edit-fragment-visibility"
                            value={form.visibility}
                            onChange={(event) =>
                                update("visibility", event.target.value)
                            }
                        >
                            {schema.visibilities.map((value) => (
                                <NativeSelectOption key={value} value={value}>
                                    {value}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </Field>
                </div>
            </CardContent>
            <CardFooter className="gap-2.5 px-3">
                {error ? (
                    <span
                        className="flex-1 text-xs"
                        style={{ color: severityColor("error") }}
                        aria-live="polite"
                    >
                        {error}
                    </span>
                ) : (
                    <span className="flex-1" />
                )}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving || !dirty || !form.title.trim()}
                    onClick={() => void save()}
                >
                    {saving ? "Saving…" : "Save changes"}
                </Button>
            </CardFooter>
        </Card>
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
                if (left.kind === "release" && right.kind === "release") {
                    // Date alone is not an order: this demo cuts 0.3.0, 0.4.0
                    // and 0.5.0 on one day, so a date-only sort left them in
                    // whatever order the records arrived — 0.3.0 above 0.5.0.
                    // The id breaks the tie descending, newest release first,
                    // the same reading the Overview's release tile settled on.
                    const byDate = right.date.localeCompare(left.date);
                    return byDate !== 0
                        ? byDate
                        : right.id.localeCompare(left.id);
                }
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

    const worstIssueVariant = active?.issues.some(
        (issue) => issue.severity === "error"
    )
        ? ("destructive" as const)
        : ("default" as const);

    const newFragmentButton = (
        <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowCreate(true)}
        >
            <Plus aria-hidden="true" />
            New fragment
        </Button>
    );

    return (
        <div className="flex min-h-0 flex-1">
            {/* ------------------------------------------------ left rail */}
            {/* Narrow: one pane at a time, the same rule Docs and Memory
                follow. A 400px rail beside a reader needs a viewport neither
                768 nor 390 has. */}
            <div
                className={cn(
                    "w-full shrink-0 flex-col border-r lg:flex lg:w-[400px]",
                    active ? "hidden" : "flex"
                )}
            >
                <div className="flex flex-col gap-2.5 p-3.5 pb-0">
                    <Card className="flex-row items-center gap-2.5 border-primary bg-primary/10 p-3">
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="text-[13px] font-semibold">
                                {unpublished.length} unpublished fragment
                                {unpublished.length === 1 ? "" : "s"}
                            </span>
                            <span className="font-mono text-[10.5px] text-muted-foreground">
                                next: {suggestedVersion} ·{" "}
                                {schema.releaseStrategy}
                            </span>
                        </span>
                        <Button
                            type="button"
                            size="sm"
                            className="whitespace-nowrap"
                            onClick={prepareRelease}
                        >
                            Prepare release
                        </Button>
                    </Card>

                    {actionError ? (
                        <Alert variant="destructive" aria-live="polite">
                            <AlertDescription>{actionError}</AlertDescription>
                        </Alert>
                    ) : null}

                    <div className="flex items-center gap-1.5">
                        <Input
                            type="search"
                            aria-label="Search history"
                            placeholder="Search fragments and releases…"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            className="h-7 flex-1 px-2.5 text-xs md:text-xs"
                        />
                        <FilterChip
                            label="state"
                            value={state}
                            options={["unreleased", "released"]}
                            onChange={setState}
                        />
                        <FilterChip
                            label="visibility"
                            value={visibility}
                            options={schema.visibilities}
                            onChange={setVisibility}
                        />
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-6 [mask-image:linear-gradient(to_bottom,black_calc(100%-24px),transparent)]">
                    {loading ? (
                        <div aria-busy="true" className="flex flex-col gap-2 pt-4">
                            {Array.from({ length: 6 }, (_, index) => (
                                <div
                                    key={index}
                                    className="h-[52px] animate-pulse rounded-md bg-muted"
                                />
                            ))}
                        </div>
                    ) : error ? (
                        <Alert
                            variant="destructive"
                            className="mt-4"
                            aria-live="polite"
                        >
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    ) : !sorted.length ? (
                        <Empty className="mt-4 gap-1 p-4 md:p-4">
                            <EmptyDescription className="text-xs">
                                No history records match the filters.
                            </EmptyDescription>
                        </Empty>
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
            </div>

            {/* ----------------------------------------------- right pane */}
            {/* The measure sits on an inner wrapper rather than the scroller,
                the way Docs does it, so the scrollbar stays at the edge of the
                pane instead of tracking the column of prose. */}
            <div
                className={cn(
                    "min-w-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8.5",
                    active ? "block" : "hidden lg:block"
                )}
            >
                <div className={READING_MEASURE}>
                {active ? (
                    <>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="-ml-2 mb-2 lg:hidden"
                            onClick={() => onSelect("")}
                        >
                            <ChevronLeft aria-hidden="true" />
                            All history
                        </Button>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px]">
                            <span className="whitespace-nowrap text-primary">
                                {active.id}
                            </span>
                            <span className="text-muted-foreground/60">·</span>
                            <span className="text-muted-foreground/70">
                                {active.kind}
                            </span>
                            <span className="text-muted-foreground/60">·</span>
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
                                    <span className="text-muted-foreground/60">
                                        ·
                                    </span>
                                    <span className="text-muted-foreground">
                                        {active.area}
                                    </span>
                                    <span className="text-muted-foreground/60">
                                        ·
                                    </span>
                                    <span className="text-muted-foreground">
                                        {active.visibility}
                                    </span>
                                    <span className="text-muted-foreground/60">
                                        ·
                                    </span>
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
                                            <span className="text-muted-foreground/60">
                                                ·
                                            </span>
                                            <span className="text-muted-foreground/70">
                                                {active.updated}
                                            </span>
                                        </>
                                    ) : null}
                                </>
                            ) : (
                                <>
                                    <span className="text-primary">
                                        {active.version}
                                    </span>
                                    <span className="text-muted-foreground/60">
                                        ·
                                    </span>
                                    <span className="text-muted-foreground">
                                        {active.date}
                                    </span>
                                    {active.commit ? (
                                        <>
                                            <span className="text-muted-foreground/60">
                                                ·
                                            </span>
                                            <span className="text-muted-foreground/70">
                                                {active.commit}
                                            </span>
                                        </>
                                    ) : null}
                                    <span className="text-muted-foreground/60">
                                        ·
                                    </span>
                                    <span className="text-muted-foreground/70">
                                        {active.fragments.length} fragment
                                        {active.fragments.length === 1
                                            ? ""
                                            : "s"}
                                    </span>
                                </>
                            )}
                            {/* The actions ride their own group so they stay
                                together and wrap as a unit onto a second line
                                once the metadata fills the first — on a phone
                                they used to crowd the row and push the close
                                control off the right edge. */}
                            <span className="ml-auto flex shrink-0 items-center gap-1">
                                {newFragmentButton}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="Close record"
                                    title="Back to the derived changelog"
                                    onClick={() => onSelect("")}
                                >
                                    <X aria-hidden="true" />
                                </Button>
                            </span>
                        </div>

                        <h2 className="mt-2.5 mb-1 text-[26px] leading-tight font-semibold tracking-tight [text-wrap:pretty]">
                            {active.title}
                        </h2>
                        <div className="font-mono text-[10.5px] break-all text-muted-foreground/70">
                            {active.path}
                        </div>

                        {active.issues.length > 0 ? (
                            <Alert
                                variant={worstIssueVariant}
                                className="mt-3.5"
                            >
                                <AlertDescription className="w-full gap-1">
                                    {active.issues.map((issue) => (
                                        <span
                                            key={`${issue.code}-${issue.message}`}
                                            className="flex items-baseline gap-2"
                                        >
                                            <span
                                                className="shrink-0 font-mono text-[10.5px]"
                                                style={{
                                                    color: severityColor(
                                                        issue.severity
                                                    )
                                                }}
                                            >
                                                {issue.severity}
                                            </span>
                                            <span>{issue.message}</span>
                                        </span>
                                    ))}
                                </AlertDescription>
                            </Alert>
                        ) : null}

                        {/* MarkdownBody brings its own .typeset wrapper. */}
                        <div className="mt-4.5">
                            <MarkdownBody
                                source={
                                    active.body || "No additional notes."
                                }
                                onOpen={openRelation}
                            />
                        </div>

                        <div className="mt-5.5 flex flex-col gap-3.5">
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
                            <div className="mt-5.5">
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
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b pb-3">
                            <span className="text-[13px] font-semibold">
                                Derived changelog
                            </span>
                            <span className="font-mono text-[11px] text-muted-foreground">
                                visibility {renderVisibility} · CHANGELOG.md
                            </span>
                            <span className="ml-auto flex flex-wrap items-center gap-2.5">
                            <ButtonGroup>
                                {schema.visibilities.map((value) => (
                                    <Button
                                        key={value}
                                        type="button"
                                        size="sm"
                                        variant={
                                            renderVisibility === value
                                                ? "default"
                                                : "outline"
                                        }
                                        aria-pressed={
                                            renderVisibility === value
                                        }
                                        className="h-7 px-2.5 text-xs"
                                        onClick={() =>
                                            setRenderVisibility(value)
                                        }
                                    >
                                        {value}
                                    </Button>
                                ))}
                            </ButtonGroup>
                            <Badge
                                variant="outline"
                                className="rounded-md font-mono text-[10.5px] font-normal whitespace-nowrap text-muted-foreground"
                            >
                                render --write
                            </Badge>
                            {newFragmentButton}
                            </span>
                        </div>
                        {rendered.error ? (
                            <Alert
                                variant="destructive"
                                className="mt-4"
                                aria-live="polite"
                            >
                                <AlertDescription>
                                    {rendered.error}
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <pre
                                className="mt-4 font-mono text-xs leading-[1.75] whitespace-pre-wrap text-muted-foreground"
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
