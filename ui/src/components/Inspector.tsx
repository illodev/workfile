import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type DragEvent
} from "react";
import { DropdownMenu } from "radix-ui";
import {
    Archive,
    ArchiveRestore,
    ChevronLeft,
    ChevronRight,
    Pencil,
    Upload,
    X
} from "lucide-react";

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

const SECTION_HEAD: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8
};

const SMALL_BTN: CSSProperties = { height: 24 };

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
            value: task.scope?.length ? task.scope.join(", ") : "—"
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
            <div className="inspector-section">
                <span
                    className="mono"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 11
                    }}
                >
                    <span style={{ color: "var(--accent)" }}>{task.id}</span>
                    <span className="faint">card</span>
                    {task.archived ? (
                        <span className="faint">archived</span>
                    ) : null}
                    <span className="spacer" />
                    <span
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            color: statusColor(task.status)
                        }}
                    >
                        <span className="dot" aria-hidden="true" />
                        {task.status}
                    </span>
                </span>
                <span className="inspector-title">{task.title}</span>
                <span className="inspector-path">{task.file}</span>
            </div>

            {/* -------------------------------------------------- actions */}
            <div
                className="inspector-section"
                style={{ flexDirection: "row", flexWrap: "wrap" }}
            >
                <a
                    className="btn"
                    style={{ textDecoration: "none" }}
                    href={fileHref(cardPath)}
                    target={linkTarget}
                    rel={linkRel}
                >
                    Open file
                </a>
                {claimed ? (
                    <button
                        type="button"
                        className="btn"
                        onClick={() =>
                            void onPatch(task.id, {
                                claimed_by: null,
                                claimed_at: null
                            }).catch(() => undefined)
                        }
                    >
                        Release
                    </button>
                ) : (
                    <button
                        type="button"
                        className="btn"
                        onClick={() =>
                            void onPatch(task.id, {
                                claimed_by: "ui-local",
                                claimed_at: new Date().toISOString()
                            }).catch(() => undefined)
                        }
                    >
                        Claim
                    </button>
                )}
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <button type="button" className="btn">
                            Transition →
                        </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                        <DropdownMenu.Content
                            className="menu"
                            align="start"
                            sideOffset={4}
                        >
                            {schema.cards.statuses.map((status) => (
                                <DropdownMenu.Item
                                    key={status}
                                    className="menu-item"
                                    data-checked={
                                        status === task.status || undefined
                                    }
                                    onSelect={() => {
                                        if (status !== task.status) {
                                            void onPatch(task.id, {
                                                status
                                            }).catch(() => undefined);
                                        }
                                    }}
                                >
                                    <span
                                        className="dot"
                                        style={{ color: statusColor(status) }}
                                        aria-hidden="true"
                                    />
                                    {status}
                                </DropdownMenu.Item>
                            ))}
                        </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                </DropdownMenu.Root>
                {["done", "discarded"].includes(task.status) ? (
                    <button
                        type="button"
                        className="btn"
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
                    </button>
                ) : null}
                <button
                    type="button"
                    className="btn"
                    onClick={() => fileRef.current?.click()}
                >
                    <Upload aria-hidden="true" />
                    Upload
                </button>
                <span className="spacer" />
                <button
                    type="button"
                    className="btn"
                    disabled={!previousId}
                    aria-label="Previous card"
                    onClick={() => previousId && onOpen(previousId)}
                >
                    <ChevronLeft aria-hidden="true" />
                </button>
                <button
                    type="button"
                    className="btn"
                    disabled={!nextId}
                    aria-label="Next card"
                    onClick={() => nextId && onOpen(nextId)}
                >
                    <ChevronRight aria-hidden="true" />
                </button>
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
            <div className="inspector-section">
                <span style={SECTION_HEAD}>
                    <span className="overline">properties</span>
                    <span className="spacer" />
                    {editingProps ? (
                        <>
                            <button
                                type="button"
                                className="btn"
                                style={SMALL_BTN}
                                disabled={saving}
                                onClick={() => {
                                    setEditingProps(false);
                                    setDraft(null);
                                }}
                            >
                                <X aria-hidden="true" />
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn-accent"
                                style={SMALL_BTN}
                                disabled={saving || titleMissing}
                                onClick={() => void saveProperties()}
                            >
                                {saving ? "Saving…" : "Save"}
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            className="btn"
                            style={SMALL_BTN}
                            onClick={openPropertyEditor}
                        >
                            <Pencil aria-hidden="true" />
                            Edit
                        </button>
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
                        className="metagrid"
                        style={{ cursor: "pointer" }}
                        title="Edit properties"
                        onClick={openPropertyEditor}
                    >
                        {metaCells.map((cell, index) => (
                            <span
                                key={cell.label}
                                className="metacell"
                                // An odd count would leave a hairline-coloured
                                // hole in the grid; the last cell spans it.
                                style={
                                    index === metaCells.length - 1 &&
                                    metaCells.length % 2
                                        ? { gridColumn: "span 2" }
                                        : undefined
                                }
                            >
                                <span className="metacell-label">
                                    {cell.label}
                                </span>
                                <span
                                    className="metacell-value"
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
                <div className="inspector-section">
                    <span className="overline">outgoing references</span>
                    {outgoing.map((link) => (
                        <button
                            key={`${link.relation}-${link.id}`}
                            type="button"
                            className="reflink"
                            onClick={() => onOpen(link.id)}
                        >
                            <span className="reflink-id">{link.id}</span>
                            <span className="reflink-title">
                                {link.title || "—"}
                            </span>
                            <span className="reflink-relation">
                                {link.relation}
                            </span>
                        </button>
                    ))}
                    {task.source ? (
                        <a
                            className="reflink"
                            style={{ textDecoration: "none" }}
                            href={fileHref(task.source)}
                            target={linkTarget}
                            rel={linkRel}
                            title={task.source}
                        >
                            <span className="reflink-id">file</span>
                            <span className="reflink-title">
                                {task.source}
                            </span>
                            <span className="reflink-relation">source</span>
                        </a>
                    ) : null}
                </div>
            ) : null}

            {/* ------------------------------------------------ backlinks */}
            {backlinks.length ? (
                <div className="inspector-section">
                    <span className="overline" style={SECTION_HEAD}>
                        backlinks
                        <span style={{ color: "var(--fg-2)" }}>
                            {backlinks.length}
                        </span>
                    </span>
                    {backlinks.map(({ card, relation }) => (
                        <button
                            key={`${relation}-${card.id}`}
                            type="button"
                            className="reflink"
                            onClick={() => onOpen(card.id)}
                        >
                            <span
                                className="dot"
                                style={{ color: statusColor(card.status) }}
                                aria-hidden="true"
                            />
                            <span className="reflink-id">{card.id}</span>
                            <span className="reflink-title">{card.title}</span>
                            <span className="reflink-relation">
                                {relation}
                            </span>
                        </button>
                    ))}
                </div>
            ) : null}

            {/* ------------------------------------------------- activity */}
            {activity.length ? (
                <div className="inspector-section">
                    <span className="overline">activity</span>
                    {activity.map((entry, at) => (
                        <div key={at} className="activity-row">
                            <span className="activity-when">{entry.when}</span>
                            <span className="activity-what">{entry.what}</span>
                        </div>
                    ))}
                </div>
            ) : null}

            {/* ----------------------------------------------------- body */}
            <div
                className="inspector-section"
                style={{
                    paddingTop: 12,
                    borderTop: "1px solid var(--line)"
                }}
            >
                <span style={SECTION_HEAD}>
                    <span className="overline">body</span>
                    <span className="spacer" />
                    <button
                        type="button"
                        className="btn"
                        style={SMALL_BTN}
                        onClick={() => setEditingBody((state) => !state)}
                    >
                        {editingBody ? (
                            <X aria-hidden="true" />
                        ) : (
                            <Pencil aria-hidden="true" />
                        )}
                        {editingBody ? "Close editor" : "Edit"}
                    </button>
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
                    <MarkdownBody source={bodyValue} onOpen={onOpen} />
                ) : (
                    <span className="faint" style={{ fontSize: 12 }}>
                        No body yet.
                    </span>
                )}
            </div>

            {/* --------------------------------------------------- assets */}
            <div className="inspector-section">
                <span className="overline" style={SECTION_HEAD}>
                    assets
                    {assets.length ? (
                        <span style={{ color: "var(--fg-2)" }}>
                            {assets.length}
                        </span>
                    ) : null}
                </span>
                {assets.map((asset) => (
                    <a
                        key={asset}
                        className="mono"
                        style={{
                            fontSize: 11,
                            color: "var(--accent)",
                            textDecoration: "none",
                            overflowWrap: "anywhere"
                        }}
                        href={`/assets/${task.id}/${encodeURIComponent(asset)}`}
                        target="_blank"
                        rel="noreferrer"
                        title={asset}
                    >
                        {asset}
                    </a>
                ))}
                <div
                    role="button"
                    tabIndex={0}
                    aria-label="Attach files"
                    style={{
                        border: `1px dashed ${dropOver ? "var(--accent)" : "var(--line)"}`,
                        borderRadius: 7,
                        padding: "14px 10px",
                        textAlign: "center",
                        cursor: "pointer",
                        background: dropOver ? "var(--accent-soft)" : "var(--bg)"
                    }}
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
                    <span
                        className="faint"
                        style={{ fontSize: 11.5, pointerEvents: "none" }}
                    >
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
        <aside className="inspector" aria-label="Inspector">
            <div className="inspector-head">
                <span className="overline">inspector</span>
                <span className="spacer" />
                {task?.revision ? (
                    <span
                        className="chip-version truncate"
                        title={task.revision}
                    >
                        {task.revision.slice(0, 14)}…
                    </span>
                ) : null}
            </div>
            <div className="inspector-body">
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
                    <div className="inspector-section">
                        <span className="overline">workspace</span>
                        <span className="inspector-title">{projectName}</span>
                        {selectedId ? (
                            <span className="dim" style={{ fontSize: 12.5 }}>
                                <span
                                    className="mono"
                                    style={{
                                        color: "var(--accent)",
                                        fontSize: 11
                                    }}
                                >
                                    {selectedId}
                                </span>{" "}
                                opens in its view on the left.
                            </span>
                        ) : (
                            <span className="dim" style={{ fontSize: 12.5 }}>
                                Select a record to inspect it.
                            </span>
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
}
