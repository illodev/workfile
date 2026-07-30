import {
    Fragment,
    useEffect,
    useMemo,
    useRef,
    useState,
    type DragEvent,
    type KeyboardEvent,
    type ReactNode
} from "react";

import {
    AREAS,
    PRIORITIES,
    STATUSES,
    TYPES,
    type Effort,
    type Task,
    type TaskPatch
} from "../types";

function InlineMarkdown({
    source,
    id
}: {
    source: string;
    id: string | number;
}) {
    const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
    return (
        <>
            {source.split(pattern).map((part, index) => {
                const key = `${id}-${index}`;
                if (part.startsWith("`") && part.endsWith("`"))
                    return <code key={key}>{part.slice(1, -1)}</code>;
                if (part.startsWith("**") && part.endsWith("**"))
                    return <strong key={key}>{part.slice(2, -2)}</strong>;
                const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
                if (link)
                    return (
                        <a
                            key={key}
                            href={link[2]}
                            target="_blank"
                            rel="noreferrer"
                        >
                            {link[1]}
                        </a>
                    );
                return <Fragment key={key}>{part}</Fragment>;
            })}
        </>
    );
}

function splitTableRow(line: string) {
    return line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim());
}

export function MarkdownBody({ source }: { source: string }) {
    const lines = source.split(/\r?\n/);
    const nodes: ReactNode[] = [];
    let list: ReactNode[] = [];
    let orderedList = false;
    let paragraph: string[] = [];
    function flushList() {
        if (!list.length) return;
        const List = orderedList ? "ol" : "ul";
        nodes.push(<List key={`list-${nodes.length}`}>{list}</List>);
        list = [];
    }
    function flushParagraph() {
        if (!paragraph.length) return;
        const text = paragraph.join(" ");
        nodes.push(
            <p key={`paragraph-${nodes.length}`}>
                <InlineMarkdown source={text} id={`p-${nodes.length}`} />
            </p>
        );
        paragraph = [];
    }
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const heading = line.match(/^(#{1,3})\s+(.*)$/);
        const item = line.match(
            /^\s*(?:([-*])|(\d+)\.)\s+(?:\[([ xX])\]\s+)?(.*)$/
        );
        const fence = line.match(/^```(.*)$/);
        const nextLine = lines[index + 1] || "";
        const isTable =
            line.includes("|") &&
            /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(
                nextLine
            );
        if (fence) {
            flushParagraph();
            flushList();
            const code: string[] = [];
            index += 1;
            while (index < lines.length && !lines[index].startsWith("```")) {
                code.push(lines[index]);
                index += 1;
            }
            nodes.push(
                <pre key={`code-${index}`}>
                    <code>{code.join("\n")}</code>
                </pre>
            );
        } else if (isTable) {
            flushParagraph();
            flushList();
            const headers = splitTableRow(line);
            const rows: string[][] = [];
            index += 2;
            while (index < lines.length && lines[index].includes("|")) {
                rows.push(splitTableRow(lines[index]));
                index += 1;
            }
            index -= 1;
            nodes.push(
                <div className="markdown-table" key={`table-${index}`}>
                    <table>
                        <thead>
                            <tr>
                                {headers.map((cell, cellIndex) => (
                                    <th key={cellIndex}>
                                        <InlineMarkdown
                                            source={cell}
                                            id={`th-${index}-${cellIndex}`}
                                        />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIndex) => (
                                <tr key={rowIndex}>
                                    {headers.map((_, cellIndex) => (
                                        <td key={cellIndex}>
                                            <InlineMarkdown
                                                source={row[cellIndex] || ""}
                                                id={`td-${index}-${rowIndex}-${cellIndex}`}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        } else if (heading) {
            flushParagraph();
            flushList();
            const Tag =
                heading[1].length === 1
                    ? "h2"
                    : heading[1].length === 2
                      ? "h3"
                      : "h4";
            nodes.push(
                <Tag key={index}>
                    <InlineMarkdown source={heading[2]} id={`h-${index}`} />
                </Tag>
            );
        } else if (item) {
            flushParagraph();
            const nextOrdered = Boolean(item[2]);
            if (list.length && orderedList !== nextOrdered) flushList();
            orderedList = nextOrdered;
            list.push(
                <li key={index}>
                    {item[3] ? (item[3] === " " ? "☐ " : "☑ ") : ""}
                    <InlineMarkdown source={item[4]} id={`li-${index}`} />
                </li>
            );
        } else if (line.startsWith(">")) {
            flushParagraph();
            flushList();
            nodes.push(
                <blockquote key={index}>
                    <InlineMarkdown
                        source={line.replace(/^>\s?/, "")}
                        id={`quote-${index}`}
                    />
                </blockquote>
            );
        } else if (/^\s*---+\s*$/.test(line)) {
            flushParagraph();
            flushList();
            nodes.push(<hr key={index} />);
        } else if (!line.trim()) {
            flushParagraph();
            flushList();
        } else {
            flushList();
            paragraph.push(line.trim());
        }
    }
    flushParagraph();
    flushList();
    return <div className="markdown-body">{nodes}</div>;
}

function splitList(value: string) {
    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="drawer-field">
            <span>{label}</span>
            {children}
        </label>
    );
}

interface DrawerProps {
    task: Task;
    repoRoot: string;
    tasks: Task[];
    orderedIds: string[];
    onOpen: (id: string) => void;
    onClose: () => void;
    onPatch: (id: string, changes: TaskPatch) => Promise<void>;
    onArchive: (id: string, archived: boolean) => Promise<void>;
    onUpload: (id: string, files: FileList) => Promise<void>;
    onEditingChange?: (editing: boolean) => void;
}

export function Drawer({
    task,
    repoRoot,
    tasks,
    orderedIds,
    onOpen,
    onClose,
    onPatch,
    onArchive,
    onUpload,
    onEditingChange
}: DrawerProps) {
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dropOver, setDropOver] = useState(false);
    const [draft, setDraft] = useState(() => ({
        title: task.title,
        status: task.status,
        priority: task.priority,
        type: task.type,
        area: task.area,
        effort: task.effort || "",
        parent: task.parent || "",
        milestone: task.milestone || "",
        source: task.source || "",
        tags: (task.tags || []).join(", "),
        scope: (task.scope || []).join(", "),
        depends: (task.depends || []).join(", "),
        start: task.start || "",
        due: task.due || ""
    }));
    const closeRef = useRef<HTMLButtonElement>(null);
    const previousFocus = useRef<HTMLElement | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        previousFocus.current = document.activeElement as HTMLElement | null;
        closeRef.current?.focus();
        return () => previousFocus.current?.focus();
    }, []);

    // Keyed on the id, not on the object: every background reload hands over a
    // fresh Task instance and rehydrating there would erase the open form.
    useEffect(() => {
        setEditing(false);
        setDraft({
            title: task.title,
            status: task.status,
            priority: task.priority,
            type: task.type,
            area: task.area,
            effort: task.effort || "",
            parent: task.parent || "",
            milestone: task.milestone || "",
            source: task.source || "",
            tags: (task.tags || []).join(", "),
            scope: (task.scope || []).join(", "),
            depends: (task.depends || []).join(", "),
            start: task.start || "",
            due: task.due || ""
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [task.id]);

    useEffect(() => {
        onEditingChange?.(editing);
        return () => onEditingChange?.(false);
    }, [editing, onEditingChange]);

    const children = useMemo(
        () => tasks.filter((candidate) => candidate.parent === task.id),
        [task.id, tasks]
    );
    const index = orderedIds.indexOf(task.id);
    const previousId = index > 0 ? orderedIds[index - 1] : null;
    const nextId =
        index >= 0 && index < orderedIds.length - 1
            ? orderedIds[index + 1]
            : null;

    function trapFocus(event: KeyboardEvent<HTMLElement>) {
        if (event.key !== "Tab") return;
        const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]"
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    async function save() {
        setSaving(true);
        try {
            await onPatch(task.id, {
                title: draft.title,
                status: draft.status,
                priority: draft.priority,
                type: draft.type,
                area: draft.area,
                effort: (draft.effort || null) as Effort | null,
                parent: draft.parent || null,
                milestone: draft.milestone || null,
                source: draft.source || null,
                tags: splitList(draft.tags),
                scope: splitList(draft.scope),
                depends: splitList(draft.depends),
                start: draft.start || null,
                due: draft.due || null
            });
            setEditing(false);
        } catch {
            // The app-level error banner keeps the drawer open for correction.
        } finally {
            setSaving(false);
        }
    }

    const vscodePath = (path: string) => `vscode://file${repoRoot}/${path}`;
    return (
        <>
            <button
                className="drawer-backdrop"
                type="button"
                aria-label="Close card"
                onClick={onClose}
            />
            <aside
                className="drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="drawer-title"
                onKeyDown={trapFocus}
            >
                <header className="drawer-header">
                    <div className="drawer-navigation">
                        <span className="mono">{task.id}</span>
                        <button
                            type="button"
                            className="icon-button"
                            disabled={!previousId}
                            onClick={() => previousId && onOpen(previousId)}
                            aria-label="Previous card"
                        >
                            ←
                        </button>
                        <button
                            type="button"
                            className="icon-button"
                            disabled={!nextId}
                            onClick={() => nextId && onOpen(nextId)}
                            aria-label="Next card"
                        >
                            →
                        </button>
                        <button
                            ref={closeRef}
                            type="button"
                            className="icon-button close-button"
                            onClick={onClose}
                            aria-label="Close card"
                        >
                            ×
                        </button>
                    </div>
                    <h2 id="drawer-title">{task.title}</h2>
                    <div className="task-card-meta">
                        <span>{task.status}</span>
                        <span>{task.priority}</span>
                        <span>{task.type}</span>
                        <span>{task.area}</span>
                    </div>
                </header>
                <div className="drawer-content">
                    <div className="drawer-actions">
                        <button
                            className="button"
                            type="button"
                            onClick={() => setEditing((current) => !current)}
                        >
                            {editing ? "Cancel editing" : "Edit metadata"}
                        </button>
                        {editing && (
                            <button
                                className="button button-primary"
                                type="button"
                                disabled={saving || !draft.title.trim()}
                                onClick={() => void save()}
                            >
                                {saving ? "Saving…" : "Save changes"}
                            </button>
                        )}
                    </div>
                    {editing ? (
                        <div className="drawer-form">
                            <Field label="Title">
                                <input
                                    value={draft.title}
                                    onChange={(event) =>
                                        setDraft((current) => ({
                                            ...current,
                                            title: event.target.value
                                        }))
                                    }
                                />
                            </Field>
                            <div className="form-grid">
                                {(
                                    [
                                        ["status", STATUSES],
                                        ["priority", PRIORITIES],
                                        ["type", TYPES],
                                        ["area", AREAS]
                                    ] as const
                                ).map(([key, options]) => (
                                    <Field label={key} key={key}>
                                        <select
                                            value={draft[key]}
                                            onChange={(event) =>
                                                setDraft((current) => ({
                                                    ...current,
                                                    [key]: event.target.value
                                                }))
                                            }
                                        >
                                            {options.map((option) => (
                                                <option key={option}>
                                                    {option}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>
                                ))}
                                <Field label="Effort">
                                    <select
                                        value={draft.effort}
                                        onChange={(event) =>
                                            setDraft((current) => ({
                                                ...current,
                                                effort: event.target.value
                                            }))
                                        }
                                    >
                                        <option value="">—</option>
                                        <option>S</option>
                                        <option>M</option>
                                        <option>L</option>
                                    </select>
                                </Field>
                                {[
                                    "parent",
                                    "milestone",
                                    "source",
                                    "tags",
                                    "scope",
                                    "depends",
                                    "start",
                                    "due"
                                ].map((key) => (
                                    <Field label={key} key={key}>
                                        <input
                                            type={
                                                key === "start" || key === "due"
                                                    ? "date"
                                                    : "text"
                                            }
                                            value={
                                                draft[key as keyof typeof draft]
                                            }
                                            onChange={(event) =>
                                                setDraft((current) => ({
                                                    ...current,
                                                    [key]: event.target.value
                                                }))
                                            }
                                        />
                                    </Field>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <dl className="metadata-list">
                            {task.parent && (
                                <Fragment>
                                    <dt>Parent</dt>
                                    <dd>
                                        <button
                                            type="button"
                                            className="link-button"
                                            onClick={() => onOpen(task.parent!)}
                                        >
                                            {task.parent}
                                        </button>
                                    </dd>
                                </Fragment>
                            )}
                            {task.source && (
                                <Fragment>
                                    <dt>Source</dt>
                                    <dd>
                                        <a href={vscodePath(task.source)}>
                                            {task.source}
                                        </a>
                                    </dd>
                                </Fragment>
                            )}
                            <dt>Card file</dt>
                            <dd>
                                <a
                                    href={vscodePath(
                                        `.planning/backlog/${task.archived ? "archive" : "tasks"}/${task.file}`
                                    )}
                                >
                                    {task.file}
                                </a>
                            </dd>
                            <dt>Updated</dt>
                            <dd>{task.updated || "—"}</dd>
                            {task.scope?.length ? (
                                <Fragment>
                                    <dt>Scope</dt>
                                    <dd>{task.scope.join(", ")}</dd>
                                </Fragment>
                            ) : null}
                            {task.depends?.length ? (
                                <Fragment>
                                    <dt>Depends</dt>
                                    <dd>
                                        {task.depends.map(
                                            (dependency, dependencyIndex) => (
                                                <Fragment key={dependency}>
                                                    {dependencyIndex > 0
                                                        ? ", "
                                                        : ""}
                                                    <button
                                                        type="button"
                                                        className="link-button"
                                                        onClick={() =>
                                                            onOpen(dependency)
                                                        }
                                                    >
                                                        {dependency}
                                                    </button>
                                                </Fragment>
                                            )
                                        )}
                                    </dd>
                                </Fragment>
                            ) : null}
                            {task.milestone ? (
                                <Fragment>
                                    <dt>Milestone</dt>
                                    <dd>{task.milestone}</dd>
                                </Fragment>
                            ) : null}
                            {task.tags?.length ? (
                                <Fragment>
                                    <dt>Tags</dt>
                                    <dd>
                                        {task.tags
                                            .map((tag) => `#${tag}`)
                                            .join(" ")}
                                    </dd>
                                </Fragment>
                            ) : null}
                            {task.claimed_by || task.claimed_at ? (
                                <Fragment>
                                    <dt>Claim</dt>
                                    <dd>
                                        {task.claimed_by || "—"} ·{" "}
                                        {task.claimed_at || "—"}{" "}
                                        <button
                                            type="button"
                                            className="link-button"
                                            onClick={() =>
                                                void onPatch(task.id, {
                                                    claimed_by: null,
                                                    claimed_at: null
                                                }).catch(() => undefined)
                                            }
                                        >
                                            Release claim
                                        </button>
                                    </dd>
                                </Fragment>
                            ) : null}
                        </dl>
                    )}

                    {children.length > 0 && (
                        <section className="drawer-section">
                            <h3>Children ({children.length})</h3>
                            {children.map((child) => (
                                <button
                                    className="child-link"
                                    type="button"
                                    key={child.id}
                                    onClick={() => onOpen(child.id)}
                                >
                                    <span
                                        className={`status-dot status-${child.status}`}
                                    />
                                    <span className="mono">{child.id}</span>
                                    <span>{child.title}</span>
                                </button>
                            ))}
                        </section>
                    )}

                    <section className="drawer-section">
                        <h3>Attachments</h3>
                        <div className="attachments">
                            {(task.assets || []).map((asset) => {
                                const url = `/assets/${task.id}/${encodeURIComponent(asset)}`;
                                const image =
                                    /\.(png|jpe?g|gif|webp|svg)$/i.test(asset);
                                return (
                                    <a
                                        key={asset}
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        title={asset}
                                    >
                                        {image ? (
                                            <img
                                                src={url}
                                                alt={asset}
                                                width={142}
                                                height={96}
                                                loading="lazy"
                                            />
                                        ) : (
                                            asset
                                        )}
                                    </a>
                                );
                            })}
                        </div>
                        <div
                            className={
                                dropOver ? "dropzone is-over" : "dropzone"
                            }
                            role="button"
                            tabIndex={0}
                            onClick={() => fileRef.current?.click()}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ")
                                    fileRef.current?.click();
                            }}
                            onDragOver={(event: DragEvent<HTMLDivElement>) => {
                                event.preventDefault();
                                setDropOver(true);
                            }}
                            onDragLeave={() => setDropOver(false)}
                            onDrop={(event: DragEvent<HTMLDivElement>) => {
                                event.preventDefault();
                                setDropOver(false);
                                void onUpload(
                                    task.id,
                                    event.dataTransfer.files
                                );
                            }}
                        >
                            Drop files here or browse
                        </div>
                        <input
                            ref={fileRef}
                            type="file"
                            multiple
                            hidden
                            onChange={(event) => {
                                if (event.target.files)
                                    void onUpload(task.id, event.target.files);
                            }}
                        />
                    </section>

                    {["done", "discarded"].includes(task.status) && (
                        <button
                            className="button"
                            type="button"
                            onClick={() => {
                                if (
                                    task.archived ||
                                    confirm(
                                        `Archive ${task.id}? You can unarchive it later.`
                                    )
                                )
                                    void onArchive(task.id, task.archived);
                            }}
                        >
                            {task.archived ? "Unarchive" : "Archive"}
                        </button>
                    )}
                    <MarkdownBody source={task.body} />
                </div>
            </aside>
        </>
    );
}
