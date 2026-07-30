import { useEffect, useMemo, useState } from "react";
import { Eye, Pencil, SlidersHorizontal } from "lucide-react";

import { api } from "../api";
import { AppDialog, ChipToggle, Field } from "../kit";
import { changeTouches, useWorkspaceChanges } from "../store/live";
import { recordStatusColor } from "../theme";
import type { DocumentRecord, RecordLink, RuntimeSchema } from "../types";
import { BodyEditor } from "./BodyEditor";
import { MarkdownBody } from "./Markdown";

/**
 * Documentation view: a 290px rail of documents grouped by provenance
 * (managed under `.project/docs` vs indexed read-only files) and a reading
 * pane. Managed documents can be edited in place — body through the shared
 * BodyEditor, metadata through a dialog — both carrying the record revision
 * as `If-Match` so a concurrent write surfaces instead of being clobbered.
 */

/** Statuses offered before the workspace schema has been fetched. */
const DOC_STATUS_FALLBACK = ["current", "draft", "superseded", "archived"];

interface MetaDraft {
    id: string;
    title: string;
    kind: string;
    status: string;
    /** Comma-separated in the form; split before patching. */
    owners: string;
    reviewed: string;
}

function DocRow({
    document,
    selected,
    onSelect
}: {
    document: DocumentRecord;
    selected: boolean;
    onSelect: () => void;
}) {
    // Hover carries the same panel wash as selection; there is no shared rail
    // class for this yet, so the row tracks it itself.
    const [hover, setHover] = useState(false);
    return (
        <button
            type="button"
            aria-current={selected ? "true" : undefined}
            onClick={onSelect}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: "7px 9px",
                border: 0,
                borderRadius: 6,
                background:
                    selected || hover ? "var(--panel)" : "transparent",
                color: "var(--fg)",
                font: "inherit",
                textAlign: "left",
                cursor: "pointer",
                width: "100%"
            }}
        >
            <span
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    width: "100%"
                }}
            >
                <span
                    className="truncate"
                    style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }}
                >
                    {document.title}
                </span>
                <span
                    className="mono"
                    style={{
                        fontSize: 10,
                        color: document.managed
                            ? recordStatusColor(document.status)
                            : "var(--fg-3)"
                    }}
                >
                    {document.managed ? document.status : "indexed"}
                </span>
            </span>
            <span
                className="mono truncate"
                style={{ fontSize: 10, color: "var(--fg-3)", width: "100%" }}
            >
                {document.path}
            </span>
        </button>
    );
}

function MetaTile({ label, value }: { label: string; value: string }) {
    return (
        <span
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: "7px 10px",
                border: "1px solid var(--line)",
                borderRadius: 7,
                background: "var(--surface)",
                minWidth: 120
            }}
        >
            <span
                className="overline"
                style={{ fontSize: 9.5, letterSpacing: "0.07em" }}
            >
                {label}
            </span>
            <span style={{ fontSize: 12.5 }}>{value}</span>
        </span>
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
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="overline">{label}</span>
            {links.map((link, index) => {
                // A backlink whose record is gone has nowhere to go; it stays
                // visible but inert rather than opening an empty inspector.
                const dead = !link.exists && !link.title;
                return (
                    <button
                        key={`${link.id}-${index}`}
                        type="button"
                        className="reflink"
                        disabled={dead}
                        style={
                            dead
                                ? { opacity: 0.55, cursor: "default" }
                                : undefined
                        }
                        onClick={() => onOpen(link.id)}
                    >
                        <span className="reflink-id">{link.id}</span>
                        <span className="reflink-title">
                            {link.title ||
                                (link.exists === false
                                    ? "Missing record"
                                    : link.id)}
                        </span>
                        {link.relation ? (
                            <span className="reflink-relation">
                                {link.relation}
                            </span>
                        ) : null}
                    </button>
                );
            })}
        </section>
    );
}

const SEPARATOR = (
    <span aria-hidden="true" style={{ color: "var(--fg-3)" }}>
        ·
    </span>
);

export function DocsView({
    selectedId,
    onSelect,
    onOpenCard
}: {
    selectedId: string | null;
    onSelect: (id: string) => void;
    onOpenCard: (id: string) => void;
}) {
    const [documents, setDocuments] = useState<DocumentRecord[]>([]);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [managedOnly, setManagedOnly] = useState(false);
    // Only managed documents can be edited: an indexed one is read-only
    // through the protocol by definition, and offering an editor for it would
    // promise something the server will refuse.
    const [editingBody, setEditingBody] = useState(false);
    const [metaDraft, setMetaDraft] = useState<MetaDraft | null>(null);
    const [metaSaving, setMetaSaving] = useState(false);
    const [metaError, setMetaError] = useState("");
    // Fetched lazily the first time the metadata dialog opens; it rides the
    // workspace call, and most visits to this view never edit metadata.
    const [docSchema, setDocSchema] = useState<RuntimeSchema["docs"] | null>(
        null
    );
    // Bumped when documents change on disk, so the load effect reruns. This
    // view used to load once per mount and never again: a document written by
    // an agent stayed invisible until the user navigated away and back.
    const [reloadKey, setReloadKey] = useState(0);
    useWorkspaceChanges((change) => {
        if (changeTouches(change, "/docs/", "docs/")) {
            setReloadKey((key) => key + 1);
        }
    });

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        const timeout = window.setTimeout(
            () => {
                void api
                    .docs(query.trim())
                    .then((response) => {
                        if (!cancelled) {
                            setDocuments(response.records);
                            setError("");
                        }
                    })
                    .catch((reason: unknown) => {
                        if (!cancelled)
                            setError(
                                reason instanceof Error
                                    ? reason.message
                                    : String(reason)
                            );
                    })
                    .finally(() => {
                        if (!cancelled) setLoading(false);
                    });
            },
            query ? 180 : 0
        );
        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
        };
    }, [query, reloadKey]);

    useEffect(() => {
        if (!metaDraft || docSchema) return;
        let cancelled = false;
        void api
            .tasks()
            .then((response) => {
                if (!cancelled) setDocSchema(response.schema.docs);
            })
            .catch(() => {
                // The form falls back to observed values; the server still
                // validates whatever is submitted.
            });
        return () => {
            cancelled = true;
        };
    }, [metaDraft, docSchema]);

    const visible = useMemo(
        () =>
            managedOnly
                ? documents.filter((document) => document.managed)
                : documents,
        [documents, managedOnly]
    );
    const groups = useMemo(() => {
        const managed = visible.filter((document) => document.managed);
        const indexed = visible.filter((document) => !document.managed);
        return [
            { key: "managed", label: ".project/docs · managed", docs: managed },
            { key: "indexed", label: "indexed · read only", docs: indexed }
        ].filter((group) => group.docs.length > 0);
    }, [visible]);

    const active =
        visible.find((document) => document.id === selectedId) || visible[0];

    const openRelation = (id: string) => {
        const document = documents.find((candidate) => candidate.id === id);
        if (document) onSelect(document.id);
        else onOpenCard(id);
    };

    const kindOptions = useMemo(() => {
        const options = new Set<string>(docSchema?.kinds ?? []);
        for (const document of documents) {
            if (document.managed) options.add(document.documentKind);
        }
        if (metaDraft) options.add(metaDraft.kind);
        return [...options].sort();
    }, [docSchema, documents, metaDraft]);
    const statusOptions = useMemo(() => {
        const options = new Set<string>(
            docSchema?.statuses ?? DOC_STATUS_FALLBACK
        );
        for (const document of documents) {
            if (document.managed) options.add(document.status);
        }
        if (metaDraft) options.add(metaDraft.status);
        return [...options].sort();
    }, [docSchema, documents, metaDraft]);

    function openMetadata(document: DocumentRecord) {
        setMetaError("");
        setMetaDraft({
            id: document.id,
            title: document.title,
            kind: document.documentKind,
            status: document.status,
            owners: (document.owners ?? []).join(", "),
            reviewed: document.reviewed ?? ""
        });
    }

    async function saveMetadata() {
        if (!metaDraft) return;
        const record = documents.find(
            (candidate) => candidate.id === metaDraft.id
        );
        if (!record) {
            setMetaError("This document no longer exists in the workspace.");
            return;
        }
        const owners = metaDraft.owners
            .split(",")
            .map((owner) => owner.trim())
            .filter(Boolean);
        // Only what actually changed goes on the wire: every patched field
        // stamps `updated`, and other agents revalidate against it.
        const changes: Record<string, unknown> = {};
        const title = metaDraft.title.trim();
        if (title && title !== record.title) changes.title = title;
        if (metaDraft.kind !== record.documentKind)
            changes.kind = metaDraft.kind;
        if (metaDraft.status !== record.status)
            changes.status = metaDraft.status;
        if (owners.join("\n") !== (record.owners ?? []).join("\n"))
            changes.owners = owners;
        if ((metaDraft.reviewed || "") !== (record.reviewed ?? ""))
            changes.reviewed = metaDraft.reviewed || null;
        if (!Object.keys(changes).length) {
            setMetaDraft(null);
            return;
        }
        setMetaSaving(true);
        setMetaError("");
        try {
            const saved = await api.patchDocument(
                record.id,
                changes,
                record.revision
            );
            setDocuments((current) =>
                current.map((candidate) =>
                    candidate.id === record.id ? saved.record : candidate
                )
            );
            setMetaDraft(null);
        } catch (reason) {
            const failure = reason as Error & { code?: string };
            if (failure.code?.endsWith("WRITE_CONFLICT")) {
                // Refresh the list so a retry patches against the revision now
                // on disk instead of failing the same way again.
                setReloadKey((key) => key + 1);
                setMetaError(
                    "The document changed on disk; the list was refreshed. Save again to apply your changes to the latest revision."
                );
            } else {
                setMetaError(failure.message || String(reason));
            }
        } finally {
            setMetaSaving(false);
        }
    }

    return (
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
            <aside
                aria-label="Documents"
                style={{
                    width: 290,
                    flex: "0 0 290px",
                    borderRight: "1px solid var(--line)",
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                    padding: "12px 8px"
                }}
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        padding: "0 0 10px"
                    }}
                >
                    <input
                        className="input"
                        type="search"
                        value={query}
                        aria-label="Search documentation"
                        placeholder="Search documentation…"
                        onChange={(event) => setQuery(event.target.value)}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                        <ChipToggle
                            label="managed"
                            on={managedOnly}
                            onLabel="only"
                            offLabel="all"
                            onChange={setManagedOnly}
                        />
                    </div>
                </div>
                <div
                    aria-busy={loading || undefined}
                    style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
                >
                    {loading ? (
                        <span
                            className="mono faint"
                            style={{
                                display: "block",
                                padding: "6px 8px",
                                fontSize: 10.5
                            }}
                        >
                            Loading documents…
                        </span>
                    ) : error ? (
                        <div
                            className="callout callout-error"
                            style={{ margin: "6px 0 0" }}
                        >
                            {error}
                        </div>
                    ) : !groups.length ? (
                        <span
                            className="faint"
                            style={{
                                display: "block",
                                padding: "6px 8px",
                                fontSize: 12
                            }}
                        >
                            No documents found.
                            {managedOnly
                                ? " Try another search, or include indexed files."
                                : " Try another search."}
                        </span>
                    ) : (
                        groups.map((group) => (
                            <div
                                key={group.key}
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 1,
                                    paddingBottom: 14
                                }}
                            >
                                <span
                                    className="mono"
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 7,
                                        padding: "6px 8px",
                                        fontSize: 10.5,
                                        color: "var(--fg-3)"
                                    }}
                                >
                                    <span style={{ color: "var(--fg-2)" }}>
                                        {group.label}
                                    </span>
                                    <span>{group.docs.length}</span>
                                </span>
                                {group.docs.map((document) => (
                                    <DocRow
                                        key={document.id}
                                        document={document}
                                        selected={active?.id === document.id}
                                        onSelect={() => onSelect(document.id)}
                                    />
                                ))}
                            </div>
                        ))
                    )}
                </div>
            </aside>

            <section
                style={{
                    flex: 1,
                    minWidth: 0,
                    overflowY: "auto",
                    padding: "26px 34px"
                }}
            >
                {active ? (
                    <>
                        <div
                            className="mono"
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 9,
                                fontSize: 11,
                                color: "var(--fg-2)",
                                flexWrap: "wrap"
                            }}
                        >
                            <span>{active.id}</span>
                            {SEPARATOR}
                            <span>{active.documentKind}</span>
                            {SEPARATOR}
                            <span
                                style={{
                                    color: recordStatusColor(active.status)
                                }}
                            >
                                {active.status}
                            </span>
                            {SEPARATOR}
                            <span>
                                {active.managed ? "managed" : "indexed"}
                            </span>
                            <span style={{ flex: 1 }} />
                            {active.managed ? (
                                <>
                                    <button
                                        type="button"
                                        className="btn"
                                        onClick={() =>
                                            setEditingBody((value) => !value)
                                        }
                                    >
                                        {editingBody ? (
                                            <Eye aria-hidden="true" />
                                        ) : (
                                            <Pencil aria-hidden="true" />
                                        )}
                                        {editingBody ? "Preview" : "Edit"}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn"
                                        onClick={() => openMetadata(active)}
                                    >
                                        <SlidersHorizontal aria-hidden="true" />
                                        Metadata
                                    </button>
                                </>
                            ) : null}
                        </div>
                        <h2
                            style={{
                                margin: "12px 0 6px",
                                fontSize: 26,
                                fontWeight: 600,
                                letterSpacing: "-0.02em"
                            }}
                        >
                            {active.title}
                        </h2>
                        <span
                            className="mono faint"
                            style={{ fontSize: 11, overflowWrap: "anywhere" }}
                        >
                            {active.path}
                        </span>

                        <div
                            style={{
                                display: "flex",
                                gap: 8,
                                margin: "18px 0 0",
                                flexWrap: "wrap"
                            }}
                        >
                            <MetaTile label="kind" value={active.documentKind} />
                            <MetaTile label="status" value={active.status} />
                            <MetaTile
                                label="reviewed"
                                value={active.reviewed || "—"}
                            />
                            <MetaTile
                                label="owners"
                                value={active.owners?.join(", ") || "—"}
                            />
                            <MetaTile
                                label="backlinks"
                                value={String(
                                    active.incomingTotal ??
                                        active.incoming.length
                                )}
                            />
                            {active.updated ? (
                                <MetaTile
                                    label="updated"
                                    value={active.updated}
                                />
                            ) : null}
                        </div>

                        {active.freshness.length > 0 ? (
                            <div
                                className="callout"
                                role="status"
                                style={{
                                    margin: "18px 0 0",
                                    flexDirection: "column",
                                    alignItems: "stretch",
                                    gap: 4
                                }}
                            >
                                {active.freshness.map((issue) => (
                                    <span key={`${issue.code}-${issue.message}`}>
                                        {issue.message}
                                    </span>
                                ))}
                            </div>
                        ) : null}

                        <div style={{ marginTop: 26 }}>
                            {editingBody && active.managed ? (
                                <BodyEditor
                                    key={active.id}
                                    value={active.body}
                                    revision={active.revision}
                                    onSave={async (body, revision) => {
                                        const saved = await api.patchDocument(
                                            active.id,
                                            { body },
                                            revision
                                        );
                                        setDocuments((current) =>
                                            current.map((record) =>
                                                record.id === active.id
                                                    ? saved.record
                                                    : record
                                            )
                                        );
                                    }}
                                />
                            ) : active.body.trim() ? (
                                <MarkdownBody
                                    source={active.body}
                                    onOpen={openRelation}
                                />
                            ) : (
                                <p
                                    className="faint"
                                    style={{ margin: 0, fontSize: 12.5 }}
                                >
                                    {active.managed
                                        ? "This document is empty. Use Edit to write its first version."
                                        : "This file has no body to render."}
                                </p>
                            )}
                        </div>

                        {active.outgoing.length ||
                        active.incoming.length ||
                        active.scope?.length ? (
                            <div
                                style={{
                                    marginTop: 28,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 18,
                                    maxWidth: "70ch"
                                }}
                            >
                                <RelationList
                                    label="links to"
                                    links={active.outgoing}
                                    onOpen={openRelation}
                                />
                                <RelationList
                                    label={
                                        (active.incomingTotal ??
                                            active.incoming.length) >
                                        active.incoming.length
                                            ? `backlinks (${active.incoming.length} of ${active.incomingTotal})`
                                            : "backlinks"
                                    }
                                    links={active.incoming}
                                    onOpen={openRelation}
                                />
                                {active.scope?.length ? (
                                    <section
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 6
                                        }}
                                    >
                                        <span className="overline">scope</span>
                                        {active.scope.map((path) => (
                                            <span
                                                key={path}
                                                className="mono faint"
                                                style={{
                                                    fontSize: 10.5,
                                                    overflowWrap: "anywhere"
                                                }}
                                            >
                                                {path}
                                            </span>
                                        ))}
                                    </section>
                                ) : null}
                            </div>
                        ) : null}
                    </>
                ) : (
                    <div
                        className="faint"
                        style={{
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12.5
                        }}
                    >
                        {loading
                            ? "Loading documents…"
                            : "Select a document from the list to read it."}
                    </div>
                )}
            </section>

            <AppDialog
                title={`Edit metadata${metaDraft ? ` — ${metaDraft.id}` : ""}`}
                open={metaDraft !== null}
                onClose={() => {
                    if (!metaSaving) setMetaDraft(null);
                }}
                footer={
                    <>
                        <button
                            type="button"
                            className="btn"
                            disabled={metaSaving}
                            onClick={() => setMetaDraft(null)}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="btn-accent"
                            disabled={metaSaving}
                            onClick={() => void saveMetadata()}
                        >
                            {metaSaving ? "Saving…" : "Save"}
                        </button>
                    </>
                }
            >
                {metaDraft ? (
                    <>
                        <Field label="title">
                            <input
                                className="input"
                                value={metaDraft.title}
                                onChange={(event) =>
                                    setMetaDraft({
                                        ...metaDraft,
                                        title: event.target.value
                                    })
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
                            <Field label="kind">
                                <select
                                    className="select"
                                    value={metaDraft.kind}
                                    onChange={(event) =>
                                        setMetaDraft({
                                            ...metaDraft,
                                            kind: event.target.value
                                        })
                                    }
                                >
                                    {kindOptions.map((kind) => (
                                        <option key={kind} value={kind}>
                                            {kind}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="status">
                                <select
                                    className="select"
                                    value={metaDraft.status}
                                    onChange={(event) =>
                                        setMetaDraft({
                                            ...metaDraft,
                                            status: event.target.value
                                        })
                                    }
                                >
                                    {statusOptions.map((status) => (
                                        <option key={status} value={status}>
                                            {status}
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
                            <Field label="owners">
                                <input
                                    className="input"
                                    value={metaDraft.owners}
                                    placeholder="comma-separated"
                                    onChange={(event) =>
                                        setMetaDraft({
                                            ...metaDraft,
                                            owners: event.target.value
                                        })
                                    }
                                />
                            </Field>
                            <Field label="reviewed">
                                <input
                                    className="input"
                                    type="date"
                                    value={metaDraft.reviewed}
                                    onChange={(event) =>
                                        setMetaDraft({
                                            ...metaDraft,
                                            reviewed: event.target.value
                                        })
                                    }
                                />
                            </Field>
                        </div>
                        {metaError ? (
                            <div
                                className="callout callout-error"
                                style={{ margin: 0 }}
                            >
                                {metaError}
                            </div>
                        ) : null}
                    </>
                ) : null}
            </AppDialog>
        </div>
    );
}
