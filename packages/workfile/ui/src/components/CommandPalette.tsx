import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

import { api } from "../api";
import type { SearchHit } from "../types";

/**
 * One entry point for everything.
 *
 * `/api/v2/search` ranks across cards, docs, changelog and memory in one pass;
 * the palette is the one control that reads that unified index, plus a few
 * commands (navigation, new card, theme) matched on their labels.
 */

interface Entry {
    key: string;
    /** Record id shown in the fixed mono column; commands have none. */
    id?: string;
    title: string;
    meta?: string;
    run: () => void;
}

interface Group {
    label: string;
    entries: Entry[];
}

const VIEWS = [
    "explorer",
    "triage",
    "flow",
    "epics",
    "timeline",
    "docs",
    "memory",
    "history",
    "health"
] as const;

/** Search-hit kinds, in display order, with their group labels. */
const KIND_GROUPS = [
    ["card", "cards"],
    ["doc", "docs"],
    ["memory", "memory"],
    ["change", "history"]
] as const;

export function CommandPalette({
    open,
    onClose,
    onOpenRecord,
    onNavigate,
    onCreate,
    onToggleTheme
}: {
    open: boolean;
    onClose: () => void;
    onOpenRecord: (id: string) => void;
    onNavigate: (view: string) => void;
    onCreate: () => void;
    onToggleTheme: () => void;
}) {
    const [query, setQuery] = useState("");
    const [hits, setHits] = useState<SearchHit[]>([]);
    const [active, setActive] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const previousFocus = useRef<Element | null>(null);

    const actions = useMemo<Entry[]>(
        () => [
            ...VIEWS.map((view) => ({
                key: `go:${view}`,
                title: `Go to ${view}`,
                meta: "view",
                run: () => onNavigate(view)
            })),
            { key: "new", title: "New card", meta: "action", run: onCreate },
            {
                key: "theme",
                title: "Toggle theme",
                meta: "action",
                run: onToggleTheme
            }
        ],
        [onCreate, onNavigate, onToggleTheme]
    );

    const matchingActions = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return actions.slice(0, 5);
        return actions.filter((action) =>
            action.title.toLowerCase().includes(needle)
        );
    }, [actions, query]);

    useEffect(() => {
        if (!open) return;
        previousFocus.current = document.activeElement;
        inputRef.current?.focus();
        return () => {
            // Returning focus is what makes a dialog usable from the keyboard;
            // without it the next Tab starts from the top of the document.
            (previousFocus.current as HTMLElement | null)?.focus?.();
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const term = query.trim();
        if (!term) {
            setHits([]);
            return;
        }
        let cancelled = false;
        const timer = window.setTimeout(() => {
            void api
                .search(term)
                .then((payload) => {
                    if (!cancelled) setHits(payload.records || []);
                })
                .catch(() => undefined);
        }, 120);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [open, query]);

    const groups = useMemo<Group[]>(() => {
        const built: Group[] = [];
        if (matchingActions.length) {
            built.push({ label: "commands", entries: matchingActions });
        }
        for (const [kind, label] of KIND_GROUPS) {
            const entries = hits
                .filter((hit) => hit.kind === kind)
                .map((hit) => ({
                    key: hit.id,
                    id: hit.id,
                    title: hit.title,
                    meta: [hit.status, hit.area].filter(Boolean).join(" · "),
                    run: () => onOpenRecord(hit.id)
                }));
            if (entries.length) built.push({ label, entries });
        }
        // Hits of a kind the groups above don't know keep working anyway.
        const known = new Set<string>(KIND_GROUPS.map(([kind]) => kind));
        const rest = hits
            .filter((hit) => !known.has(hit.kind))
            .map((hit) => ({
                key: hit.id,
                id: hit.id,
                title: hit.title,
                meta: [hit.kind, hit.status, hit.area]
                    .filter(Boolean)
                    .join(" · "),
                run: () => onOpenRecord(hit.id)
            }));
        if (rest.length) built.push({ label: "other", entries: rest });
        return built;
    }, [hits, matchingActions, onOpenRecord]);

    const entries = useMemo(
        () => groups.flatMap((group) => group.entries),
        [groups]
    );

    useEffect(() => setActive(0), [query]);

    useEffect(() => {
        listRef.current
            ?.querySelector('[data-selected="true"]')
            ?.scrollIntoView({ block: "nearest" });
    }, [active, entries]);

    const choose = useCallback(
        (index: number) => {
            const entry = entries[index];
            if (!entry) return;
            entry.run();
            onClose();
        },
        [entries, onClose]
    );

    if (!open) return null;

    let cursor = -1;
    return (
        <div className="overlay" onClick={onClose}>
            <div
                className="palette"
                role="dialog"
                aria-modal="true"
                aria-label="Command palette"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                    if (event.key === "Escape") {
                        event.preventDefault();
                        onClose();
                    }
                }}
            >
                <div className="palette-input">
                    <Search aria-hidden="true" />
                    <input
                        ref={inputRef}
                        value={query}
                        placeholder="Search everything, or type a command…"
                        aria-label="Search cards, docs, history and memory"
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "ArrowDown") {
                                event.preventDefault();
                                setActive((current) =>
                                    Math.min(entries.length - 1, current + 1)
                                );
                            } else if (event.key === "ArrowUp") {
                                event.preventDefault();
                                setActive((current) =>
                                    Math.max(0, current - 1)
                                );
                            } else if (event.key === "Enter") {
                                event.preventDefault();
                                choose(active);
                            }
                        }}
                    />
                    <span className="kbd">esc</span>
                </div>
                <div
                    className="palette-list"
                    ref={listRef}
                    role="listbox"
                    aria-label="Results"
                >
                    {entries.length === 0 ? (
                        <div
                            style={{
                                padding: "14px 10px",
                                fontSize: 12.5,
                                color: "var(--fg-3)"
                            }}
                        >
                            No card, doc, history or memory entry matches this
                            query.
                        </div>
                    ) : (
                        groups.map((group) => (
                            <div key={group.label} style={{ padding: "6px 0" }}>
                                <span className="palette-group-label overline">
                                    {group.label}
                                </span>
                                {group.entries.map((entry) => {
                                    cursor += 1;
                                    const index = cursor;
                                    const selected = index === active;
                                    return (
                                        <button
                                            type="button"
                                            key={entry.key}
                                            className="palette-hit"
                                            role="option"
                                            aria-selected={selected}
                                            data-selected={
                                                selected ? "true" : undefined
                                            }
                                            onMouseEnter={() =>
                                                setActive(index)
                                            }
                                            onClick={() => choose(index)}
                                        >
                                            {entry.id ? (
                                                <span className="palette-hit-id">
                                                    {entry.id}
                                                </span>
                                            ) : null}
                                            <span className="palette-hit-title">
                                                {entry.title}
                                            </span>
                                            {entry.meta ? (
                                                <span className="palette-hit-meta">
                                                    {entry.meta}
                                                </span>
                                            ) : null}
                                        </button>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>
                <div className="palette-foot">
                    <span>↑↓ navigate</span>
                    <span>↵ open</span>
                    <span className="spacer" />
                    <span>unified index · local server</span>
                </div>
            </div>
        </div>
    );
}
