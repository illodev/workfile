import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { api } from "../api";
import type { BaseRecord } from "../types";
import { MarkdownBody } from "./Markdown";

/**
 * Any record, read-only, in the shared drawer.
 *
 * The fallback content for every kind that has no editing panel of its own —
 * docs, decisions, learnings, conventions, changelog fragments, releases. Cards
 * get the `Inspector`; the views that own a collection and can edit it keep
 * their own panels. Everything else used to have no way to be opened at all
 * unless the reader was already in the view that lists it, which is why a
 * `[[DOC-0002]]` in a card body led nowhere.
 *
 * It reads through the kind-agnostic `api.record`, so what it can show is
 * whatever the index holds rather than whatever the caller guessed from the
 * shape of the ID.
 */
export function RecordPanel({
    id,
    onSelect,
    onOpen
}: {
    id: string;
    /** Follows a link inside the body without leaving the drawer. */
    onSelect: (id: string) => void;
    /** Leaves for the view that lists this kind. */
    onOpen: (id: string) => void;
}) {
    const [record, setRecord] = useState<BaseRecord | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let live = true;
        setRecord(null);
        setError(null);
        api.record(id)
            .then((response) => {
                if (live) setRecord(response.record);
            })
            .catch((cause: Error) => {
                if (live) setError(cause.message);
            });
        return () => {
            live = false;
        };
    }, [id]);

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
            <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium">{id}</span>
                {record ? (
                    <Badge
                        variant="secondary"
                        className="px-1.5 py-0 text-[10px] font-normal"
                    >
                        {record.recordType}
                    </Badge>
                ) : null}
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 gap-1 px-2 text-xs"
                    onClick={() => onOpen(id)}
                >
                    <ExternalLink aria-hidden="true" className="size-3" />
                    Open in its view
                </Button>
            </div>
            <h2 className="mt-1 text-sm font-medium">
                {record?.title ?? (error ? "Unavailable" : "…")}
            </h2>
            {error ? (
                <p className="mt-4 text-xs text-muted-foreground">{error}</p>
            ) : record ? (
                // The knobs the card inspector sets, so a record does not
                // change size depending on which sheet opened it: ~13px body,
                // leading 1.6, prose capped at a readable measure while scroll
                // wrappers keep the full column. They have to land on the
                // `.typeset` element itself, whose component-layer defaults
                // beat an inherited custom property.
                <div className="mt-3 [&>.typeset]:[--typeset-leading:1.6] [&>.typeset]:[--typeset-size:0.8125rem] [&>.typeset>:not(.typeset-scroll)]:max-w-[72ch]">
                    <MarkdownBody
                        source={record.body || "_This record has no body._"}
                        onOpen={onSelect}
                        headingPrefix="record"
                    />
                </div>
            ) : (
                <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    Reading {id}…
                </div>
            )}
        </div>
    );
}
