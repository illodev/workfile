import { useEffect, useMemo, useState } from "react";
import {
    BookIcon,
    FileDiffIcon,
    LightBulbIcon,
    SearchIcon
} from "@primer/octicons-react";

import { api } from "../api";
import type {
    KnowledgeDocument,
    KnowledgeIndex,
    KnowledgeKind,
    KnowledgeSummary
} from "../types";
import { MarkdownBody } from "./Drawer";

const EMPTY_INDEX: KnowledgeIndex = { changelogs: [], learnings: [] };

function DocumentRow({
    document,
    active,
    onSelect
}: {
    document: KnowledgeSummary;
    active: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            className={`knowledge-row${active ? " is-active" : ""}`}
            onClick={onSelect}
        >
            <span className="knowledge-row-heading">
                <span className="mono">{document.id}</span>
                {document.severity && (
                    <span
                        className={`severity-badge severity-${document.severity}`}
                    >
                        {document.severity}
                    </span>
                )}
            </span>
            {document.kind === "learning" && <strong>{document.title}</strong>}
            <span className="knowledge-row-meta">
                {document.kind === "changelog"
                    ? `${document.entries || 0} entries`
                    : [
                          document.category,
                          document.graduated ? "graduated" : "active",
                          document.occurrences
                              ? `${document.occurrences} occurrences`
                              : null
                      ]
                          .filter(Boolean)
                          .join(" · ")}
            </span>
        </button>
    );
}

export function KnowledgeView({ repoRoot }: { repoRoot: string }) {
    const [index, setIndex] = useState<KnowledgeIndex>(EMPTY_INDEX);
    const [kind, setKind] = useState<KnowledgeKind>("changelog");
    const [query, setQuery] = useState("");
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [documents, setDocuments] = useState<
        Record<string, KnowledgeDocument>
    >({});
    const [loadingIndex, setLoadingIndex] = useState(true);
    const [loadingDocument, setLoadingDocument] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        void api
            .knowledge()
            .then((response) => {
                if (!cancelled) {
                    setIndex(response);
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
                if (!cancelled) setLoadingIndex(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const items = kind === "changelog" ? index.changelogs : index.learnings;
    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return items;
        return items.filter((item) =>
            [item.id, item.title, item.category, item.severity, item.date].some(
                (value) =>
                    String(value || "")
                        .toLowerCase()
                        .includes(needle)
            )
        );
    }, [items, query]);
    const activePath =
        filtered.find((item) => item.path === selectedPath)?.path ||
        filtered[0]?.path ||
        null;
    const activeSummary = filtered.find((item) => item.path === activePath);
    const documentKey = activePath ? `${kind}:${activePath}` : null;
    const activeDocument = documentKey ? documents[documentKey] : undefined;

    useEffect(() => {
        if (!activePath || !documentKey || documents[documentKey]) return;
        let cancelled = false;
        setLoadingDocument(true);
        void api
            .knowledgeDocument(kind, activePath)
            .then((document) => {
                if (!cancelled) {
                    setDocuments((current) => ({
                        ...current,
                        [documentKey]: document
                    }));
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
                if (!cancelled) setLoadingDocument(false);
            });
        return () => {
            cancelled = true;
        };
    }, [activePath, documentKey, documents, kind]);

    const selectKind = (nextKind: KnowledgeKind) => {
        setKind(nextKind);
        setSelectedPath(null);
        setQuery("");
    };

    if (loadingIndex)
        return <main className="loading">Loading knowledge index…</main>;

    return (
        <main className="knowledge-view">
            <header className="knowledge-toolbar">
                <div>
                    <BookIcon size={18} aria-hidden="true" />
                    <strong>Project knowledge</strong>
                    <span>
                        {index.changelogs.length} changelogs ·{" "}
                        {index.learnings.length} learnings
                    </span>
                </div>
                <label className="search-control knowledge-search">
                    <SearchIcon size={16} aria-hidden="true" />
                    <span className="sr-only">Search knowledge</span>
                    <input
                        type="search"
                        autoComplete="off"
                        placeholder={`Search ${kind === "changelog" ? "changelogs" : "learnings"}…`}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </label>
            </header>
            {error && (
                <div className="notice notice-error" aria-live="polite">
                    {error}
                </div>
            )}
            <div className="knowledge-layout">
                <aside className="knowledge-sidebar">
                    <div className="knowledge-tabs">
                        <button
                            type="button"
                            className={kind === "changelog" ? "is-active" : ""}
                            onClick={() => selectKind("changelog")}
                        >
                            <FileDiffIcon size={16} aria-hidden="true" />
                            Changelog
                            <span>{index.changelogs.length}</span>
                        </button>
                        <button
                            type="button"
                            className={kind === "learning" ? "is-active" : ""}
                            onClick={() => selectKind("learning")}
                        >
                            <LightBulbIcon size={16} aria-hidden="true" />
                            Learnings
                            <span>{index.learnings.length}</span>
                        </button>
                    </div>
                    <div className="knowledge-list">
                        {filtered.map((item) => (
                            <DocumentRow
                                key={`${item.kind}:${item.path}`}
                                document={item}
                                active={item.path === activePath}
                                onSelect={() => setSelectedPath(item.path)}
                            />
                        ))}
                        {!filtered.length && (
                            <p className="column-empty">No documents found</p>
                        )}
                    </div>
                </aside>
                <article className="knowledge-document">
                    {activeSummary ? (
                        <>
                            <header>
                                <div>
                                    <span className="mono">
                                        {activeSummary.id}
                                    </span>
                                    <h1>{activeSummary.title}</h1>
                                    <p>
                                        {[
                                            activeSummary.date,
                                            activeSummary.category,
                                            activeSummary.graduated
                                                ? "graduated"
                                                : kind === "learning"
                                                  ? "active"
                                                  : null
                                        ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </p>
                                </div>
                                <a
                                    className="button"
                                    href={`vscode://file${repoRoot}/${activeSummary.repoPath}`}
                                >
                                    Open source
                                </a>
                            </header>
                            {loadingDocument && !activeDocument ? (
                                <div className="loading">Loading document…</div>
                            ) : activeDocument ? (
                                <MarkdownBody source={activeDocument.body} />
                            ) : null}
                        </>
                    ) : (
                        <div className="empty-state">
                            Select a document to read it.
                        </div>
                    )}
                </article>
            </div>
        </main>
    );
}
