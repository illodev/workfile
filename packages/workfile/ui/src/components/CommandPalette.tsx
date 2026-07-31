import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandShortcut
} from "@/components/ui/command";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle
} from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from "@/components/ui/tooltip";

import { api } from "../api";
import { recordCollection } from "../theme";
import type { SearchHit, SearchMode } from "../types";

/**
 * One entry point for everything.
 *
 * `/api/v2/search` ranks across cards, docs, changelog and memory in one pass;
 * the palette is the one control that reads that unified index, plus a few
 * commands (navigation, new card, theme) matched on their labels.
 *
 * Results are server-ranked and commands are pre-filtered in `useMemo`, so the
 * inner cmdk `Command` runs with `shouldFilter={false}` — it only owns
 * selection, keyboard navigation and scroll-into-view.
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
    "overview",
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

/** One-liners behind the mode badge: how this response was ranked. */
const MODE_HELP: Record<SearchMode, string> = {
    lexical: "Deterministic lexical ranking",
    hybrid: "Ranked by lexical score blended with on-device embeddings",
    regex: "Exact regular-expression match"
};

/** How the server ranked the hits currently on screen. */
interface SearchMeta {
    mode: SearchMode;
    provider: string | null;
    total: number;
}

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
    const [meta, setMeta] = useState<SearchMeta | null>(null);
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
        // The query goes to the server untouched — it detects the
        // `/pattern/flags` regex form itself and reports the mode it ran.
        const term = query.trim();
        if (!term) {
            setHits([]);
            setMeta(null);
            return;
        }
        let cancelled = false;
        const timer = window.setTimeout(() => {
            void api
                .search(term)
                .then((payload) => {
                    if (cancelled) return;
                    setHits(payload.records || []);
                    setMeta({
                        mode: payload.mode,
                        provider: payload.provider ?? null,
                        total: payload.total ?? payload.records?.length ?? 0
                    });
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

    // The syntax is discoverable the moment a query opens with "/": the hint
    // names the full form while the query still travels to the server as-is.
    const regexHint = query.trim().startsWith("/");

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogContent
                aria-label="Command palette"
                showCloseButton={false}
                className="top-[110px] max-h-[min(560px,calc(100svh-150px))] translate-y-0 gap-0 overflow-hidden rounded-[14px] p-0 sm:max-w-[620px]"
                onOpenAutoFocus={() => {
                    // The palette opens from a global keybinding, so Radix has
                    // no trigger to restore focus to — remember it ourselves.
                    previousFocus.current = document.activeElement;
                }}
                onCloseAutoFocus={(event) => {
                    // Returning focus is what makes a dialog usable from the
                    // keyboard; without it the next Tab starts from the top of
                    // the document.
                    event.preventDefault();
                    (previousFocus.current as HTMLElement | null)?.focus?.();
                }}
            >
                <DialogTitle className="sr-only">Command palette</DialogTitle>
                <DialogDescription className="sr-only">
                    Search cards, docs, history and memory, or run a command.
                </DialogDescription>
                <Command
                    shouldFilter={false}
                    className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-input]]:h-12"
                >
                    <div className="relative">
                        <CommandInput
                            value={query}
                            onValueChange={setQuery}
                            placeholder="Search everything, or type a command…"
                            aria-label="Search cards, docs, history and memory"
                            className="pr-12"
                        />
                        <Kbd className="absolute top-1/2 right-3 -translate-y-1/2">
                            Esc
                        </Kbd>
                    </div>
                    {regexHint || meta ? (
                        <div className="flex min-h-7 items-center gap-2 border-b px-3.5 py-1 font-mono text-[10.5px] text-muted-foreground">
                            {regexHint ? (
                                <span className="truncate">
                                    Regular expression — /pattern/flags
                                </span>
                            ) : null}
                            {meta ? (
                                <span className="ml-auto flex shrink-0 items-center gap-2">
                                    <span>
                                        {meta.total}{" "}
                                        {meta.total === 1
                                            ? "result"
                                            : "results"}
                                    </span>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Badge
                                                    variant="outline"
                                                    className="rounded-sm px-1.5 font-mono text-[10px] font-normal text-muted-foreground"
                                                >
                                                    {meta.mode === "hybrid" &&
                                                    meta.provider
                                                        ? `hybrid · ${meta.provider}`
                                                        : meta.mode}
                                                </Badge>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom">
                                                {MODE_HELP[meta.mode]}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                    <CommandList
                        label="Results"
                        className="max-h-[min(400px,calc(100svh-240px))] p-1.5"
                    >
                        <CommandEmpty className="px-2.5 py-3.5 text-left text-[12.5px] text-muted-foreground">
                            No card, doc, history or memory entry matches this
                            query.
                        </CommandEmpty>
                        {groups.map((group) => (
                            <CommandGroup
                                key={group.label}
                                heading={group.label}
                            >
                                {group.entries.map((entry) => (
                                    <CommandItem
                                        key={entry.key}
                                        value={entry.key}
                                        onSelect={() => {
                                            entry.run();
                                            onClose();
                                        }}
                                        className="gap-2.5 rounded-md px-[9px] py-2 text-[13px]"
                                    >
                                        {entry.id ? (
                                            <Badge
                                                variant="outline"
                                                title={recordCollection(
                                                    entry.id
                                                )}
                                                className="w-[78px] shrink-0 justify-start rounded-sm px-1.5 font-mono text-[11.5px] font-normal text-muted-foreground"
                                            >
                                                {entry.id}
                                            </Badge>
                                        ) : null}
                                        <span className="flex-1 truncate">
                                            {entry.title}
                                        </span>
                                        {entry.meta ? (
                                            <CommandShortcut className="shrink-0 font-mono text-[10.5px] tracking-normal">
                                                {entry.meta}
                                            </CommandShortcut>
                                        ) : null}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        ))}
                    </CommandList>
                    <div className="flex items-center gap-3.5 border-t px-3.5 py-2 font-mono text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <KbdGroup>
                                <Kbd>↑</Kbd>
                                <Kbd>↓</Kbd>
                            </KbdGroup>
                            navigate
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Kbd>↵</Kbd>
                            open
                        </span>
                        <span className="ml-auto">
                            unified index · local server
                        </span>
                    </div>
                </Command>
            </DialogContent>
        </Dialog>
    );
}
