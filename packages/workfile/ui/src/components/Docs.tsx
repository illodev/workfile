import { useEffect, useMemo, useRef, useState } from "react";
import {
    ChevronLeft,
    Eye,
    Pencil,
    Search,
    SlidersHorizontal,
    TriangleAlert
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput
} from "@/components/ui/input-group";
import { Item } from "@/components/ui/item";
import {
    NativeSelect,
    NativeSelectOption
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { api } from "../api";
import { READING_MEASURE } from "../layout";
import { changeTouches, useWorkspaceChanges } from "../store/live";
import { recordStatusColor } from "../theme";
import type { DocumentRecord, RecordLink, RuntimeSchema } from "../types";
import { BodyEditor } from "./BodyEditor";
import { documentOutline, MarkdownBody, type OutlineEntry } from "./Markdown";

/** Heading anchors for this view — see `documentOutline`. */
const DOC_HEADINGS = "doc-h";

/**
 * Documentation view: a 290px rail of documents grouped by provenance
 * (managed under `.project/docs` vs indexed read-only files) and a reading
 * pane. Managed documents can be edited in place — body through the shared
 * BodyEditor, metadata through a dialog — both carrying the record revision
 * as `If-Match` so a concurrent write surfaces instead of being clobbered.
 */

/** Statuses offered before the workspace schema has been fetched. */
const DOC_STATUS_FALLBACK = ["current", "draft", "superseded", "archived"];

/** Small uppercase tracking label used for tiles, relations and scope. */
const OVERLINE =
    "text-[10px] font-medium tracking-[0.07em] uppercase text-muted-foreground";

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
    // Hover carries the same wash as selection; both come from the accent
    // token now, so the row no longer tracks hover in state.
    return (
        <Item
            asChild
            size="sm"
            className={cn(
                "w-full cursor-pointer flex-col items-start gap-0.5 px-2 py-1.5 text-left hover:bg-accent",
                selected && "bg-accent"
            )}
        >
            <button
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={onSelect}
            >
                <span className="flex w-full items-center gap-1.5">
                    <span className="flex-1 truncate text-xs font-medium">
                        {document.title}
                    </span>
                    <span
                        className={cn(
                            "font-mono text-[10px]",
                            !document.managed && "text-muted-foreground"
                        )}
                        style={
                            document.managed
                                ? {
                                      color: recordStatusColor(document.status)
                                  }
                                : undefined
                        }
                    >
                        {document.managed ? document.status : "indexed"}
                    </span>
                </span>
                <span className="w-full truncate font-mono text-[10px] text-muted-foreground">
                    {document.path}
                </span>
            </button>
        </Item>
    );
}

/**
 * The document's own table of contents, beside the prose.
 *
 * A spec in this workspace runs past a dozen headings and the reader gave no
 * map of it: the only way to reach a section was to scroll until its heading
 * went past. The rail is the same answer every reading surface converges on —
 * headings listed, the one on screen marked, click to jump.
 *
 * It sits outside the reading scroller rather than sticky inside it: a sibling
 * of the pane does not move, which is the behaviour sticky is trying to imitate,
 * and it keeps its own overflow when a document has more headings than fit.
 */
function Outline({
    entries,
    activeId,
    onJump
}: {
    entries: OutlineEntry[];
    activeId: string;
    onJump: (id: string) => void;
}) {
    // The shallowest heading in this document is the left margin; everything
    // deeper indents relative to it. A body that starts at `##` should not
    // begin one step in.
    const base = Math.min(...entries.map((entry) => entry.level));
    return (
        <aside
            aria-label="Document outline"
            className="hidden w-[228px] shrink-0 overflow-y-auto border-l px-3 py-6.5 xl:block"
        >
            <span className={cn(OVERLINE, "px-2")}>on this page</span>
            <nav className="mt-2 flex flex-col gap-px">
                {entries.map((entry) => {
                    const active = entry.id === activeId;
                    return (
                        <button
                            key={entry.id}
                            type="button"
                            aria-current={active ? "true" : undefined}
                            className={cn(
                                "cursor-pointer rounded-md px-2 py-1 text-left text-xs leading-snug transition-colors hover:bg-accent",
                                active
                                    ? "bg-accent font-medium text-foreground"
                                    : "text-muted-foreground"
                            )}
                            style={{
                                paddingLeft: `${8 + Math.min(entry.level - base, 3) * 12}px`
                            }}
                            onClick={() => onJump(entry.id)}
                        >
                            {entry.text}
                        </button>
                    );
                })}
            </nav>
        </aside>
    );
}

function MetaTile({ label, value }: { label: string; value: string }) {
    return (
        <Field className="w-auto min-w-[120px] gap-0.5 rounded-lg border bg-card px-3 py-2 shadow-xs">
            <span className={OVERLINE}>{label}</span>
            <span className="text-[13px] font-medium">{value}</span>
        </Field>
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
        <section className="flex flex-col gap-1.5">
            <span className={OVERLINE}>{label}</span>
            {links.map((link, index) => {
                // A backlink whose record is gone has nowhere to go; it stays
                // visible but inert rather than opening an empty inspector.
                const dead = !link.exists && !link.title;
                return (
                    <Item
                        key={`${link.id}-${index}`}
                        asChild
                        variant="outline"
                        size="sm"
                        className={cn(
                            "w-full cursor-pointer gap-2 px-2.5 py-2 text-left hover:bg-accent",
                            dead &&
                                "cursor-default opacity-55 hover:bg-transparent"
                        )}
                    >
                        <button
                            type="button"
                            disabled={dead}
                            onClick={() => onOpen(link.id)}
                        >
                            <span className="min-w-[78px] shrink-0 font-mono text-[11px] font-medium">
                                {link.id}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                {link.title ||
                                    (link.exists === false
                                        ? "Missing record"
                                        : link.id)}
                            </span>
                            {link.relation ? (
                                <Badge
                                    variant="secondary"
                                    className="font-mono text-[10px]"
                                >
                                    {link.relation}
                                </Badge>
                            ) : null}
                        </button>
                    </Item>
                );
            })}
        </section>
    );
}

const SEPARATOR = (
    <span aria-hidden="true" className="text-muted-foreground">
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

    // ------------------------------------------------------------- outline
    const readerRef = useRef<HTMLElement>(null);
    const [activeHeading, setActiveHeading] = useState("");
    const outline = useMemo(
        () =>
            active && !editingBody
                ? documentOutline(active.body, DOC_HEADINGS)
                : [],
        [active, editingBody]
    );
    // Under two headings there is nothing to navigate: a rail listing the one
    // section a document has is a rail that only takes width.
    const showOutline = outline.length > 1;

    useEffect(() => {
        setActiveHeading("");
        const root = readerRef.current;
        if (!root || !showOutline) return;
        const visibility = new Map<string, boolean>();
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries)
                    visibility.set(entry.target.id, entry.isIntersecting);
                // First in document order wins: while two headings share the
                // band, the one being read is the upper one. Nothing in the
                // band — scrolled past the last heading — keeps the last
                // answer rather than blanking the rail.
                const current = outline.find((entry) =>
                    visibility.get(entry.id)
                );
                if (current) setActiveHeading(current.id);
            },
            // The band is the top third of the pane: a heading counts as "the
            // section you are reading" once it reaches it, not when it first
            // creeps in at the bottom of the viewport.
            { root, rootMargin: "0px 0px -66% 0px", threshold: 0 }
        );
        for (const entry of outline) {
            const node = document.getElementById(entry.id);
            if (node) observer.observe(node);
        }
        return () => observer.disconnect();
    }, [outline, showOutline]);

    const jumpTo = (id: string) => {
        document
            .getElementById(id)
            ?.scrollIntoView({ block: "start", behavior: "smooth" });
        setActiveHeading(id);
    };

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
        <div className="flex min-h-0 flex-1">
            {/* Narrow: one pane at a time. The list and the reader split a
                viewport that cannot carry both — at 768 each got less than
                400px — so opening a document hands it the whole width and the
                Back control returns. */}
            <aside
                aria-label="Documents"
                className={cn(
                    "min-h-0 w-full shrink-0 flex-col border-r px-2 py-3 lg:flex lg:w-[290px]",
                    active ? "hidden" : "flex"
                )}
            >
                <div className="flex flex-col gap-2 pb-2.5">
                    <InputGroup className="h-8">
                        <InputGroupAddon>
                            <Search aria-hidden="true" />
                        </InputGroupAddon>
                        <InputGroupInput
                            className="h-8"
                            type="search"
                            value={query}
                            aria-label="Search documentation"
                            placeholder="Search documentation…"
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </InputGroup>
                    <div className="flex gap-1.5">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-pressed={managedOnly}
                            className={cn(
                                "h-7 gap-1.5 px-2.5 text-xs",
                                managedOnly && "border-ring bg-accent"
                            )}
                            onClick={() => setManagedOnly(!managedOnly)}
                        >
                            managed
                            <span className="font-normal text-muted-foreground">
                                {managedOnly ? "only" : "all"}
                            </span>
                        </Button>
                    </div>
                </div>
                <div
                    aria-busy={loading || undefined}
                    className="min-h-0 flex-1 overflow-y-auto"
                >
                    {loading ? (
                        <span className="flex items-center gap-2 px-2 py-1.5 font-mono text-[10.5px] text-muted-foreground">
                            <Spinner className="size-3" />
                            Loading documents…
                        </span>
                    ) : error ? (
                        <Alert variant="destructive" className="mt-1.5">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    ) : !groups.length ? (
                        <Empty className="gap-2 p-4 md:p-4">
                            <EmptyHeader>
                                <EmptyTitle className="text-sm">
                                    No documents found.
                                </EmptyTitle>
                                <EmptyDescription className="text-xs">
                                    {managedOnly
                                        ? "Try another search, or include indexed files."
                                        : "Try another search."}
                                </EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        groups.map((group) => (
                            <div
                                key={group.key}
                                className="flex flex-col gap-px pb-3.5"
                            >
                                <span className="flex items-center gap-2 px-2 py-1.5 font-mono text-[10.5px] text-muted-foreground">
                                    <span className="text-foreground/80">
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

            {/* The reader ran the full width of the pane, which on a wide
                display is a line nobody finishes. The measure is on an inner
                wrapper rather than the scroller so the scrollbar stays at the
                edge of the pane, where it belongs. */}
            <section
                ref={readerRef}
                className={cn(
                    "min-w-0 flex-1 overflow-y-auto px-6 py-6.5 sm:px-8.5",
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
                            All documents
                        </Button>
                        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
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
                            <span className="flex-1" />
                            {active.managed ? (
                                <>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
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
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openMetadata(active)}
                                    >
                                        <SlidersHorizontal aria-hidden="true" />
                                        Metadata
                                    </Button>
                                </>
                            ) : null}
                        </div>
                        <h2 className="mt-3 mb-1.5 text-2xl font-semibold tracking-tight">
                            {active.title}
                        </h2>
                        <span className="font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
                            {active.path}
                        </span>

                        <div className="mt-4.5 flex flex-wrap gap-2">
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
                            <Alert role="status" className="mt-4.5 max-w-2xl">
                                <TriangleAlert
                                    aria-hidden="true"
                                    className="text-sev-warning"
                                />
                                <AlertDescription>
                                    {active.freshness.map((issue) => (
                                        <span
                                            key={`${issue.code}-${issue.message}`}
                                        >
                                            {issue.message}
                                        </span>
                                    ))}
                                </AlertDescription>
                            </Alert>
                        ) : null}

                        <div className="mt-6.5">
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
                                    headingPrefix={DOC_HEADINGS}
                                    onOpen={openRelation}
                                />
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    {active.managed
                                        ? "This document is empty. Use Edit to write its first version."
                                        : "This file has no body to render."}
                                </p>
                            )}
                        </div>

                        {active.outgoing.length ||
                        active.incoming.length ||
                        active.scope?.length ? (
                            <div className="mt-7 flex max-w-[70ch] flex-col gap-4.5">
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
                                    <section className="flex flex-col gap-1.5">
                                        <span className={OVERLINE}>scope</span>
                                        {active.scope.map((path) => (
                                            <span
                                                key={path}
                                                className="font-mono text-[10.5px] text-muted-foreground [overflow-wrap:anywhere]"
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
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        {loading
                            ? "Loading documents…"
                            : "Select a document from the list to read it."}
                    </div>
                )}
                </div>
            </section>

            {showOutline ? (
                <Outline
                    entries={outline}
                    activeId={activeHeading}
                    onJump={jumpTo}
                />
            ) : null}

            <Dialog
                open={metaDraft !== null}
                onOpenChange={(next) => {
                    if (!next && !metaSaving) setMetaDraft(null);
                }}
            >
                <DialogContent aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>
                            {`Edit metadata${metaDraft ? ` — ${metaDraft.id}` : ""}`}
                        </DialogTitle>
                    </DialogHeader>
                    {metaDraft ? (
                        <FieldGroup className="gap-4">
                            <Field>
                                <FieldLabel htmlFor="docs-meta-title">
                                    title
                                </FieldLabel>
                                <Input
                                    id="docs-meta-title"
                                    value={metaDraft.title}
                                    onChange={(event) =>
                                        setMetaDraft({
                                            ...metaDraft,
                                            title: event.target.value
                                        })
                                    }
                                />
                            </Field>
                            <div className="grid grid-cols-2 gap-2.5">
                                <Field className="[&_[data-slot=native-select-wrapper]]:w-full">
                                    <FieldLabel htmlFor="docs-meta-kind">
                                        kind
                                    </FieldLabel>
                                    <NativeSelect
                                        id="docs-meta-kind"
                                        value={metaDraft.kind}
                                        onChange={(event) =>
                                            setMetaDraft({
                                                ...metaDraft,
                                                kind: event.target.value
                                            })
                                        }
                                    >
                                        {kindOptions.map((kind) => (
                                            <NativeSelectOption
                                                key={kind}
                                                value={kind}
                                            >
                                                {kind}
                                            </NativeSelectOption>
                                        ))}
                                    </NativeSelect>
                                </Field>
                                <Field className="[&_[data-slot=native-select-wrapper]]:w-full">
                                    <FieldLabel htmlFor="docs-meta-status">
                                        status
                                    </FieldLabel>
                                    <NativeSelect
                                        id="docs-meta-status"
                                        value={metaDraft.status}
                                        onChange={(event) =>
                                            setMetaDraft({
                                                ...metaDraft,
                                                status: event.target.value
                                            })
                                        }
                                    >
                                        {statusOptions.map((status) => (
                                            <NativeSelectOption
                                                key={status}
                                                value={status}
                                            >
                                                {status}
                                            </NativeSelectOption>
                                        ))}
                                    </NativeSelect>
                                </Field>
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                                <Field>
                                    <FieldLabel htmlFor="docs-meta-owners">
                                        owners
                                    </FieldLabel>
                                    <Input
                                        id="docs-meta-owners"
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
                                <Field>
                                    <FieldLabel htmlFor="docs-meta-reviewed">
                                        reviewed
                                    </FieldLabel>
                                    <Input
                                        id="docs-meta-reviewed"
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
                                <Alert variant="destructive">
                                    <AlertDescription>
                                        {metaError}
                                    </AlertDescription>
                                </Alert>
                            ) : null}
                        </FieldGroup>
                    ) : null}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={metaSaving}
                            onClick={() => setMetaDraft(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            disabled={metaSaving}
                            onClick={() => void saveMetadata()}
                        >
                            {metaSaving ? "Saving…" : "Save"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
