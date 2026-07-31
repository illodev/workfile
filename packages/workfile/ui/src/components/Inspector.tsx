import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
    Archive,
    ArchiveRestore,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Paperclip,
    Pencil,
    Upload,
    X
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
    Attachment,
    AttachmentContent,
    AttachmentMedia,
    AttachmentTrigger
} from "@/components/ui/attachment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle
} from "@/components/ui/empty";
import { Item } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";

import { api } from "../api";
import { priorityColor, statusColor } from "../theme";
import { BodyEditor } from "./BodyEditor";
import { MarkdownBody } from "./Markdown";
import { PropertyEditor } from "./PropertyEditor";
import {
    cardProperties,
    inferKind,
    type PropertyDefinition
} from "./property-model";
import type { RuntimeSchema, Task, TaskPatch } from "../types";

/**
 * The fixed right-hand rail of the redesign: always present, showing the
 * selected record with its metadata grid, references, backlinks, activity and
 * body — and, for cards, the full editing surface the old Drawer carried
 * (transition, claim, properties, body editor, uploads, archive).
 */
export interface InspectorProps {
    task?: Task;
    selectedId: string | null;
    repoRoot: string;
    repoUrl?: string;
    tasks: Task[];
    areas: string[];
    schema: RuntimeSchema;
    orderedIds: string[];
    onOpen: (id: string) => void;
    onClose: () => void;
    onPatch: (id: string, changes: TaskPatch) => Promise<void>;
    onEditingChange: (editing: boolean) => void;
    onArchive: (id: string, archived: boolean) => Promise<void>;
    onUpload: (id: string, files: FileList) => Promise<void>;
    projectName: string;
}

/** Task keys that are not frontmatter properties and never appear as fields. */
const SYSTEM_KEYS = new Set(["file", "body", "archived", "assets", "revision"]);

/** What the card PATCH endpoint accepts; everything else is locked here. */
const PATCHABLE = new Set([
    "title",
    "status",
    "type",
    "priority",
    "area",
    "parent",
    "depends",
    "milestone",
    "source",
    "tags",
    "effort",
    "scope",
    "start",
    "due",
    "related"
]);

function sameValue(a: unknown, b: unknown) {
    if (Array.isArray(a) || Array.isArray(b)) {
        return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
    }
    return (a ?? null) === (b ?? null);
}

/**
 * The durable `## Activity` trail the protocol appends to a card body:
 * `- 2026-07-30 10:33Z actor · moved to done`. Parsed leniently — the block
 * is written by many tools over a card's life — and shown condensed above the
 * prose, where "who moved this and when" is what the rail is for.
 */
function parseActivity(body: string): Array<{ when: string; what: string }> {
    const lines = body.split(/\r?\n/);
    const rows: Array<{ when: string; what: string }> = [];
    let inBlock = false;
    for (const line of lines) {
        if (/^##\s+Activity\s*$/.test(line.trim())) {
            inBlock = true;
            continue;
        }
        if (!inBlock) continue;
        if (/^#{1,6}\s/.test(line)) break;
        const entry = line.match(/^\s*[-*]\s+(.*)$/);
        if (!entry) continue;
        const stamped = entry[1].match(
            /^(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?Z?\s+(.*)$/
        );
        if (stamped) rows.push({ when: stamped[1], what: stamped[2] });
        else rows.push({ when: "", what: entry[1] });
    }
    return rows;
}

/** Small-caps section heading, shared by every block in the rail. */
const OVERLINE =
    "text-[11px] font-medium uppercase tracking-wider text-muted-foreground";

/** One vertical block; `shrink-0` keeps the scroll container honest. */
const SECTION = "flex shrink-0 flex-col gap-2";

interface CardInspectorProps {
    task: Task;
    repoRoot: string;
    repoUrl?: string;
    tasks: Task[];
    areas: string[];
    schema: RuntimeSchema;
    orderedIds: string[];
    onOpen: (id: string) => void;
    onPatch: (id: string, changes: TaskPatch) => Promise<void>;
    onEditingChange: (editing: boolean) => void;
    onArchive: (id: string, archived: boolean) => Promise<void>;
    onUpload: (id: string, files: FileList) => Promise<void>;
}

function CardInspector({
    task,
    repoRoot,
    repoUrl,
    tasks,
    areas,
    schema,
    orderedIds,
    onOpen,
    onPatch,
    onEditingChange,
    onArchive,
    onUpload
}: CardInspectorProps) {
    const [editingProps, setEditingProps] = useState(false);
    const [editingBody, setEditingBody] = useState(false);
    const [saving, setSaving] = useState(false);
    const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
    const [dropOver, setDropOver] = useState(false);
    // The last body this rail wrote, with the revision the server answered.
    // While the editor is open the app suppresses background reloads, so the
    // `task` prop can lag what is actually on disk; content-derived revisions
    // make "caught up" checkable by comparing bodies.
    const [savedBody, setSavedBody] = useState<{
        body: string;
        revision?: string;
    } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // Set while a form here holds unsaved input: a background reload would
    // replace the record object and wipe what the user typed.
    const editing = editingProps || editingBody;
    useEffect(() => {
        onEditingChange(editing);
        return () => onEditingChange(false);
    }, [editing, onEditingChange]);

    const definitions = useMemo<PropertyDefinition[]>(() => {
        const base = cardProperties(schema).map((definition) =>
            definition.key === "area" && areas.length
                ? { ...definition, options: areas }
                : definition
        );
        const milestoneAt = base.findIndex(
            (definition) => definition.key === "milestone"
        );
        base.splice(milestoneAt + 1, 0, { key: "source", kind: "text" });
        // Custom frontmatter is shown but locked: the codec round-trips it,
        // while the card PATCH endpoint refuses keys outside the protocol set
        // — an editable field whose save always fails would be a lie.
        const knownKeys = new Set(base.map((definition) => definition.key));
        const record = task as unknown as Record<string, unknown>;
        for (const [key, value] of Object.entries(record)) {
            if (knownKeys.has(key) || SYSTEM_KEYS.has(key)) continue;
            base.push({ key, kind: inferKind(key, value), readOnly: true });
        }
        return base;
    }, [areas, schema, task]);

    const taskById = useMemo(
        () => new Map(tasks.map((entry) => [entry.id, entry])),
        [tasks]
    );

    const outgoing = useMemo(() => {
        const rows: Array<{ id: string; title: string; relation: string }> =
            [];
        if (task.parent) {
            rows.push({
                id: task.parent,
                title: taskById.get(task.parent)?.title ?? "",
                relation: "parent"
            });
        }
        for (const dependency of task.depends || []) {
            rows.push({
                id: dependency,
                title: taskById.get(dependency)?.title ?? "",
                relation: "depends"
            });
        }
        return rows;
    }, [task.parent, task.depends, taskById]);

    const backlinks = useMemo(() => {
        const rows: Array<{ card: Task; relation: string }> = [];
        for (const candidate of tasks) {
            if (candidate.id === task.id) continue;
            if (candidate.parent === task.id) {
                rows.push({ card: candidate, relation: "child" });
            } else if (candidate.depends?.includes(task.id)) {
                rows.push({ card: candidate, relation: "depends" });
            }
        }
        return rows;
    }, [task.id, tasks]);

    const activity = useMemo(() => parseActivity(task.body), [task.body]);

    const index = orderedIds.indexOf(task.id);
    const previousId = index > 0 ? orderedIds[index - 1] : null;
    const nextId =
        index >= 0 && index < orderedIds.length - 1
            ? orderedIds[index + 1]
            : null;

    // Hosted builds (repoUrl set) link into the repository on the web;
    // local builds open the file in the user's editor.
    const fileHref = (path: string) =>
        repoUrl
            ? `${repoUrl.replace(/\/+$/, "")}/blob/main/${path}`
            : `vscode://file${repoRoot}/${path}`;
    const linkTarget = repoUrl ? "_blank" : undefined;
    const linkRel = repoUrl ? "noreferrer" : undefined;
    const cardPath = `.project/cards/${task.archived ? "archive/" : ""}${task.file}`;

    const claimed = Boolean(task.claimed_by || task.claimed_at);
    const assets = task.assets || [];

    // While the app suppresses reloads (editor open), prefer what we last
    // wrote over the stale prop; once the reload lands the bodies match and
    // the prop takes over again.
    const current =
        savedBody && savedBody.body !== task.body ? savedBody : null;
    const bodyValue = current?.body ?? task.body;
    const bodyRevision = current?.revision ?? task.revision;

    function openPropertyEditor() {
        const record = task as unknown as Record<string, unknown>;
        const values: Record<string, unknown> = {};
        for (const definition of definitions) {
            values[definition.key] =
                record[definition.key] ??
                (definition.kind === "list" ? [] : "");
        }
        setDraft(values);
        setEditingProps(true);
    }

    const titleMissing =
        editingProps && !String(draft?.title ?? "").trim();

    async function saveProperties() {
        if (!draft) return;
        setSaving(true);
        try {
            const record = task as unknown as Record<string, unknown>;
            const changes: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(draft)) {
                if (!PATCHABLE.has(key)) continue;
                const next = Array.isArray(value)
                    ? value
                    : String(value ?? "").trim() === ""
                      ? null
                      : value;
                if (!sameValue(next, record[key] ?? null)) {
                    changes[key] = next;
                }
            }
            if (Object.keys(changes).length) {
                await onPatch(task.id, changes as TaskPatch);
            }
            setEditingProps(false);
            setDraft(null);
        } catch {
            // The app-level error banner reports it; the form stays open
            // for correction.
        } finally {
            setSaving(false);
        }
    }

    const metaCells: Array<{
        label: string;
        value: string;
        color?: string;
    }> = [
        { label: "type", value: task.type },
        {
            label: "priority",
            value: task.priority,
            color: priorityColor(task.priority)
        },
        { label: "area", value: task.area },
        { label: "effort", value: task.effort || "—" },
        { label: "milestone", value: task.milestone || "—" },
        { label: "created", value: task.created || "—" },
        { label: "updated", value: task.updated || "—" },
        {
            label: "claim",
            value: claimed
                ? `${task.claimed_by || "—"} · ${task.claimed_at || "—"}`
                : "—",
            color: claimed ? statusColor("doing") : undefined
        },
        ...(task.start ? [{ label: "start", value: task.start }] : []),
        ...(task.due ? [{ label: "due", value: task.due }] : []),
        {
            label: "scope",
            value: Array.isArray(task.scope) && task.scope.length
                ? task.scope.join(", ")
                : "—"
        },
        { label: "parent", value: task.parent || "—" },
        {
            label: "tags",
            value: task.tags?.length
                ? task.tags.map((tag) => `#${tag}`).join(" ")
                : "—"
        }
    ];

    return (
        <>
            {/* ------------------------------------------------- identity */}
            <div className={SECTION}>
                <span className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono font-medium text-primary">
                        {task.id}
                    </span>
                    <Badge
                        variant="secondary"
                        className="px-2 py-0 text-[10px] font-medium"
                    >
                        card
                    </Badge>
                    {task.archived ? (
                        <Badge
                            variant="outline"
                            className="px-2 py-0 text-[10px] font-medium text-muted-foreground"
                        >
                            archived
                        </Badge>
                    ) : null}
                    <Badge
                        variant="outline"
                        className="ml-auto gap-1.5 text-[11px] font-medium"
                        style={{ color: statusColor(task.status) }}
                    >
                        <span
                            className="size-1.5 rounded-full bg-current"
                            aria-hidden="true"
                        />
                        {task.status}
                    </Badge>
                </span>
                <span className="text-sm leading-snug font-medium">
                    {task.title}
                </span>
                <span className="font-mono text-[11px] break-all text-muted-foreground">
                    {task.file}
                </span>
            </div>

            {/* -------------------------------------------------- actions */}
            <div className="flex shrink-0 flex-wrap items-center gap-2">
                <ButtonGroup>
                    <Button asChild variant="outline" size="sm">
                        <a
                            href={fileHref(cardPath)}
                            target={linkTarget}
                            rel={linkRel}
                        >
                            Open file
                        </a>
                    </Button>
                    {claimed ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                void onPatch(task.id, {
                                    claimed_by: null,
                                    claimed_at: null
                                }).catch(() => undefined)
                            }
                        >
                            Release
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                void onPatch(task.id, {
                                    claimed_by: "ui-local",
                                    claimed_at: new Date().toISOString()
                                }).catch(() => undefined)
                            }
                        >
                            Claim
                        </Button>
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                                Transition
                                <ChevronDown aria-hidden="true" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" sideOffset={4}>
                            {schema.cards.statuses.map((status) => (
                                <DropdownMenuItem
                                    key={status}
                                    onSelect={() => {
                                        if (status !== task.status) {
                                            void onPatch(task.id, {
                                                status
                                            }).catch(() => undefined);
                                        }
                                    }}
                                >
                                    <span
                                        className="size-1.5 rounded-full bg-current"
                                        style={{ color: statusColor(status) }}
                                        aria-hidden="true"
                                    />
                                    {status}
                                    {status === task.status ? (
                                        <Check
                                            className="ml-auto"
                                            aria-hidden="true"
                                        />
                                    ) : null}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </ButtonGroup>
                {["done", "discarded"].includes(task.status) ? (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            if (
                                task.archived ||
                                window.confirm(
                                    `Archive ${task.id}? You can unarchive it later.`
                                )
                            ) {
                                void onArchive(task.id, task.archived);
                            }
                        }}
                    >
                        {task.archived ? (
                            <ArchiveRestore aria-hidden="true" />
                        ) : (
                            <Archive aria-hidden="true" />
                        )}
                        {task.archived ? "Unarchive" : "Archive"}
                    </Button>
                ) : null}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                >
                    <Upload aria-hidden="true" />
                    Upload
                </Button>
                <span className="flex-1" />
                <ButtonGroup>
                    <Button
                        variant="outline"
                        size="icon-sm"
                        disabled={!previousId}
                        aria-label="Previous card"
                        onClick={() => previousId && onOpen(previousId)}
                    >
                        <ChevronLeft aria-hidden="true" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon-sm"
                        disabled={!nextId}
                        aria-label="Next card"
                        onClick={() => nextId && onOpen(nextId)}
                    >
                        <ChevronRight aria-hidden="true" />
                    </Button>
                </ButtonGroup>
                <input
                    ref={fileRef}
                    type="file"
                    multiple
                    hidden
                    onChange={(event) => {
                        if (event.target.files?.length) {
                            void onUpload(task.id, event.target.files);
                        }
                        event.target.value = "";
                    }}
                />
            </div>

            {/* ----------------------------------------------- properties */}
            <div className={SECTION}>
                <span className="flex items-center gap-2">
                    <span className={OVERLINE}>properties</span>
                    <span className="flex-1" />
                    {editingProps ? (
                        <>
                            <Button
                                variant="outline"
                                size="xs"
                                disabled={saving}
                                onClick={() => {
                                    setEditingProps(false);
                                    setDraft(null);
                                }}
                            >
                                <X aria-hidden="true" />
                                Cancel
                            </Button>
                            <Button
                                size="xs"
                                disabled={saving || titleMissing}
                                onClick={() => void saveProperties()}
                            >
                                {saving ? <Spinner className="size-3" /> : null}
                                {saving ? "Saving…" : "Save"}
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="outline"
                            size="xs"
                            onClick={openPropertyEditor}
                        >
                            <Pencil aria-hidden="true" />
                            Edit
                        </Button>
                    )}
                </span>
                {editingProps && draft ? (
                    <PropertyEditor
                        values={draft}
                        definitions={definitions}
                        disabled={saving}
                        onOpenReference={onOpen}
                        onChange={(key, value) =>
                            setDraft((state) =>
                                state ? { ...state, [key]: value } : state
                            )
                        }
                    />
                ) : (
                    <div
                        className="grid cursor-pointer grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border"
                        title="Edit properties"
                        onClick={openPropertyEditor}
                    >
                        {metaCells.map((cell, index) => (
                            <span
                                key={cell.label}
                                // An odd count would leave a hairline-coloured
                                // hole in the grid; the last cell spans it.
                                className={cn(
                                    "flex min-w-0 flex-col gap-0.5 bg-background px-2.5 py-2",
                                    index === metaCells.length - 1 &&
                                        metaCells.length % 2
                                        ? "col-span-2"
                                        : undefined
                                )}
                            >
                                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                    {cell.label}
                                </span>
                                <span
                                    className="truncate text-xs font-medium"
                                    style={
                                        cell.color
                                            ? { color: cell.color }
                                            : undefined
                                    }
                                    title={cell.value}
                                >
                                    {cell.value}
                                </span>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* ---------------------------------------- outgoing references */}
            {outgoing.length || task.source ? (
                <div className={SECTION}>
                    <span className={OVERLINE}>outgoing references</span>
                    {outgoing.map((link) => (
                        <Item
                            key={`${link.relation}-${link.id}`}
                            asChild
                            variant="outline"
                            size="sm"
                            className="w-full flex-nowrap gap-2 px-2.5 py-1.5 hover:bg-accent/50"
                        >
                            <button
                                type="button"
                                onClick={() => onOpen(link.id)}
                            >
                                <span className="shrink-0 font-mono text-[11px] font-medium">
                                    {link.id}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground">
                                    {link.title || "—"}
                                </span>
                                <Badge
                                    variant="secondary"
                                    className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
                                >
                                    {link.relation}
                                </Badge>
                            </button>
                        </Item>
                    ))}
                    {task.source ? (
                        <Item
                            asChild
                            variant="outline"
                            size="sm"
                            className="w-full flex-nowrap gap-2 px-2.5 py-1.5"
                        >
                            <a
                                href={fileHref(task.source)}
                                target={linkTarget}
                                rel={linkRel}
                                title={task.source}
                            >
                                <span className="shrink-0 font-mono text-[11px] font-medium">
                                    file
                                </span>
                                <span className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground">
                                    {task.source}
                                </span>
                                <Badge
                                    variant="secondary"
                                    className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
                                >
                                    source
                                </Badge>
                            </a>
                        </Item>
                    ) : null}
                </div>
            ) : null}

            {/* ------------------------------------------------ backlinks */}
            {backlinks.length ? (
                <div className={SECTION}>
                    <span className={cn(OVERLINE, "flex items-center gap-2")}>
                        backlinks
                        <span className="font-normal opacity-70">
                            {backlinks.length}
                        </span>
                    </span>
                    {backlinks.map(({ card, relation }) => (
                        <Item
                            key={`${relation}-${card.id}`}
                            asChild
                            variant="outline"
                            size="sm"
                            className="w-full flex-nowrap gap-2 px-2.5 py-1.5 hover:bg-accent/50"
                        >
                            <button
                                type="button"
                                onClick={() => onOpen(card.id)}
                            >
                                <span
                                    className="size-1.5 shrink-0 rounded-full bg-current"
                                    style={{ color: statusColor(card.status) }}
                                    aria-hidden="true"
                                />
                                <span className="shrink-0 font-mono text-[11px] font-medium">
                                    {card.id}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground">
                                    {card.title}
                                </span>
                                <Badge
                                    variant="secondary"
                                    className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
                                >
                                    {relation}
                                </Badge>
                            </button>
                        </Item>
                    ))}
                </div>
            ) : null}

            {/* ------------------------------------------------- activity */}
            {activity.length ? (
                <div className={SECTION}>
                    <span className={OVERLINE}>activity</span>
                    {activity.map((entry, at) => (
                        <div
                            key={at}
                            className="grid grid-cols-[78px_1fr] gap-x-2 font-mono text-[11px] leading-relaxed"
                        >
                            <span className="tabular-nums text-muted-foreground">
                                {entry.when}
                            </span>
                            <span className="text-foreground/75">
                                {entry.what}
                            </span>
                        </div>
                    ))}
                </div>
            ) : null}

            {/* ----------------------------------------------------- body */}
            <div className={cn(SECTION, "border-t pt-3")}>
                <span className="flex items-center gap-2">
                    <span className={OVERLINE}>body</span>
                    <span className="flex-1" />
                    <Button
                        variant="outline"
                        size="xs"
                        onClick={() => setEditingBody((state) => !state)}
                    >
                        {editingBody ? (
                            <X aria-hidden="true" />
                        ) : (
                            <Pencil aria-hidden="true" />
                        )}
                        {editingBody ? "Close editor" : "Edit"}
                    </Button>
                </span>
                {editingBody ? (
                    <BodyEditor
                        value={bodyValue}
                        revision={bodyRevision}
                        onSave={async (nextBody, expectedRevision) => {
                            const response = await api.patch(
                                task.id,
                                // `body` rides the card PATCH like any other
                                // field; the type stays closed to frontmatter,
                                // hence the cast.
                                { body: nextBody } as unknown as TaskPatch,
                                expectedRevision
                            );
                            setSavedBody({
                                body: nextBody,
                                revision: response.task.revision
                            });
                        }}
                    />
                ) : bodyValue.trim() ? (
                    <div className="typeset">
                        <MarkdownBody source={bodyValue} onOpen={onOpen} />
                    </div>
                ) : (
                    <span className="text-xs text-muted-foreground">
                        No body yet.
                    </span>
                )}
            </div>

            {/* --------------------------------------------------- assets */}
            <div className={SECTION}>
                <span className={cn(OVERLINE, "flex items-center gap-2")}>
                    assets
                    {assets.length ? (
                        <span className="font-normal opacity-70">
                            {assets.length}
                        </span>
                    ) : null}
                </span>
                {assets.map((asset) => (
                    <Attachment key={asset} size="sm" className="w-full">
                        <AttachmentTrigger asChild>
                            <a
                                href={`/assets/${task.id}/${encodeURIComponent(asset)}`}
                                target="_blank"
                                rel="noreferrer"
                                title={asset}
                            >
                                <span className="sr-only">{asset}</span>
                            </a>
                        </AttachmentTrigger>
                        <AttachmentMedia>
                            <Paperclip aria-hidden="true" />
                        </AttachmentMedia>
                        <AttachmentContent>
                            <span className="block font-mono text-[11px] break-all">
                                {asset}
                            </span>
                        </AttachmentContent>
                    </Attachment>
                ))}
                <div
                    role="button"
                    tabIndex={0}
                    aria-label="Attach files"
                    data-dragover={dropOver ? true : undefined}
                    className="cursor-pointer rounded-lg border border-dashed bg-background px-2.5 py-3.5 text-center transition-colors data-[dragover]:border-primary data-[dragover]:bg-primary/10"
                    onClick={() => fileRef.current?.click()}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            fileRef.current?.click();
                        }
                    }}
                    onDragOver={(event: DragEvent<HTMLDivElement>) => {
                        event.preventDefault();
                        setDropOver(true);
                    }}
                    onDragLeave={() => setDropOver(false)}
                    onDrop={(event: DragEvent<HTMLDivElement>) => {
                        event.preventDefault();
                        setDropOver(false);
                        void onUpload(task.id, event.dataTransfer.files);
                    }}
                >
                    {/* Inert label: `dragleave` bubbles, so a hit-testable
                        child would clear the drag state the moment the pointer
                        crossed onto it. Clicks retarget to the zone. */}
                    <span className="pointer-events-none text-[11px] text-muted-foreground">
                        Drop files here or click to browse.
                    </span>
                </div>
            </div>
        </>
    );
}

export function Inspector({
    task,
    selectedId,
    repoRoot,
    repoUrl,
    tasks,
    areas,
    schema,
    orderedIds,
    onOpen,
    onPatch,
    onEditingChange,
    onArchive,
    onUpload,
    projectName
}: InspectorProps) {
    return (
        <aside
            className="flex min-h-0 flex-col overflow-hidden border-l bg-background"
            aria-label="Inspector"
        >
            <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3.5">
                <span className="text-[13px] font-semibold">Inspector</span>
                <span className="flex-1" />
                {task?.revision ? (
                    <Badge
                        variant="secondary"
                        className="max-w-[16ch] font-mono text-[10px] font-medium"
                        title={task.revision}
                    >
                        <span className="truncate">
                            {task.revision.slice(0, 14)}…
                        </span>
                    </Badge>
                ) : null}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3.5 pt-4 pb-6">
                {task ? (
                    // Keyed on the id, not the object: a background reload
                    // hands over a fresh Task instance, and remounting there
                    // would erase an open form.
                    <CardInspector
                        key={task.id}
                        task={task}
                        repoRoot={repoRoot}
                        repoUrl={repoUrl}
                        tasks={tasks}
                        areas={areas}
                        schema={schema}
                        orderedIds={orderedIds}
                        onOpen={onOpen}
                        onPatch={onPatch}
                        onEditingChange={onEditingChange}
                        onArchive={onArchive}
                        onUpload={onUpload}
                    />
                ) : (
                    <Empty className="border border-dashed p-6 md:p-6">
                        <EmptyHeader>
                            <EmptyTitle className="text-base">
                                {projectName}
                            </EmptyTitle>
                            <EmptyDescription className="text-xs">
                                {selectedId ? (
                                    <>
                                        <span className="font-mono text-[11px] text-primary">
                                            {selectedId}
                                        </span>{" "}
                                        opens in its view on the left.
                                    </>
                                ) : (
                                    "Select a record to inspect it."
                                )}
                            </EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                )}
            </div>
        </aside>
    );
}
