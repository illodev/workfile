import { useMemo, useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import {
    Popover,
    PopoverContent,
    PopoverHeader,
    PopoverTitle,
    PopoverTrigger
} from "@/components/ui/popover";

import { overlapsByCard } from "../../claims";
import { claimStateColor, severityColor, since } from "../../theme";
import type { ActivitySnapshot, ClaimEntry } from "../../types";

/**
 * Every claim the workspace holds, with what the footer strip cannot say.
 *
 * The strip counts claims and shows three names. The questions that raises —
 * which actor, which scope, how long a hold has run, whether two claims
 * collide — all needed a view change to answer, and staleness is the one the
 * reader wants at a glance. The rows are the set the strip summarises in the
 * order the strip shows it, so the first three are the three names beside it
 * rather than a second, differently sorted list of the same claims.
 *
 * Staleness is `claim.state`, the server's verdict from `cards.claimLeaseHours`
 * — the lease is never re-derived here, and the interface never carries the
 * number.
 *
 * Overlaps are `activity.conflicts`: claimed cards, different actors, shared
 * paths. Not `main.tsx`'s `scopeConflicts`, which pairs in-progress cards
 * whether or not anybody claimed them and therefore names cards this list has
 * no row for. That set keeps its own alert on the work views.
 */
export function ClaimLedgerPopover({
    claims,
    conflicts,
    align,
    onOpen,
    children
}: {
    /** Ordered by `orderClaims`, so the caller and this agree on "worst". */
    claims: ClaimEntry[];
    /**
     * The raw pairs, not a derived index: the header's count and the rows'
     * warnings are one fact, and taking it twice is how two counts drift.
     */
    conflicts: ActivitySnapshot["conflicts"];
    /** Which edge the content hangs from — the strip is left, the badge right. */
    align: "start" | "end";
    onOpen: (id: string) => void;
    children: ReactNode;
}) {
    // Controlled, so selecting a row can close it. Radix returns focus to the
    // trigger on close, which is right here: the drawer that opens refuses
    // focus on open (`RecordDrawer`'s `onOpenAutoFocus`), so there is nothing
    // to arbitrate and focus lands back on the control just used.
    const [open, setOpen] = useState(false);
    const overlaps = useMemo(() => overlapsByCard(conflicts), [conflicts]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{children}</PopoverTrigger>
            <PopoverContent
                // The footer is the last row of the viewport, and the content
                // is clamped to the narrowest phone rather than the 18rem
                // default so a scope path has somewhere to go.
                side="top"
                align={align}
                sideOffset={8}
                aria-label="Active claims"
                className="w-[min(24rem,calc(100vw-1.5rem))] p-0 text-xs"
            >
                <PopoverHeader className="gap-0.5 border-b px-3 py-2 text-xs">
                    <PopoverTitle>
                        {claims.length} active claim
                        {claims.length === 1 ? "" : "s"}
                    </PopoverTitle>
                    {conflicts.length ? (
                        // The same sentence the strip shows, so opening the
                        // popover never contradicts the line that opened it.
                        <span
                            className="flex items-center gap-1.5"
                            style={{ color: severityColor("warning") }}
                        >
                            <TriangleAlert
                                className="size-3 shrink-0"
                                aria-hidden="true"
                            />
                            {conflicts.length} scope overlap
                            {conflicts.length === 1 ? "" : "s"} between claims
                        </span>
                    ) : null}
                </PopoverHeader>
                <ul
                    // Spelled out because Tailwind's preflight removes
                    // `list-style`, and Safari drops the implicit list role
                    // with it.
                    role="list"
                    className="max-h-[min(20rem,50svh)] overflow-y-auto"
                >
                    {claims.map((entry) => {
                        const collisions = overlaps.get(entry.id) ?? [];
                        const tone = claimStateColor(entry.claim.state);
                        const age = since(entry.claim.ageHours);
                        return (
                            <li
                                key={entry.id}
                                className="border-b last:border-b-0"
                            >
                                <button
                                    type="button"
                                    className="flex w-full min-w-0 flex-col gap-0.5 px-3 py-2 text-left hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
                                    onClick={() => {
                                        setOpen(false);
                                        onOpen(entry.id);
                                    }}
                                >
                                    <span className="flex w-full min-w-0 items-center gap-1.5">
                                        <span
                                            className="size-1.5 shrink-0 rounded-full"
                                            style={{ background: tone }}
                                            aria-hidden="true"
                                        />
                                        <span className="font-mono font-medium text-foreground">
                                            {entry.id}
                                        </span>
                                        <span
                                            className="ml-auto shrink-0"
                                            style={{ color: tone }}
                                        >
                                            {entry.claim.state} ·{" "}
                                            {age || "age unknown"}
                                        </span>
                                    </span>
                                    <span className="w-full truncate text-muted-foreground">
                                        {entry.title}
                                    </span>
                                    <span
                                        className="w-full truncate font-mono text-[11px] text-muted-foreground"
                                        // The line truncates and a claimed
                                        // scope is exactly the thing worth
                                        // reading in full.
                                        title={[
                                            entry.claim.by,
                                            ...entry.scope
                                        ].join("\n")}
                                    >
                                        {entry.claim.by} ·{" "}
                                        {/* Load-bearing rather than blank: a
                                            claim with no scope cannot collide
                                            with anything, which is why it will
                                            never carry an overlap line. */}
                                        {entry.scope.length
                                            ? entry.scope.join(" · ")
                                            : "no scope"}
                                    </span>
                                    {collisions.length ? (
                                        <span
                                            className="flex w-full min-w-0 items-start gap-1.5"
                                            style={{
                                                color: severityColor("warning")
                                            }}
                                        >
                                            <TriangleAlert
                                                className="mt-px size-3 shrink-0"
                                                aria-hidden="true"
                                            />
                                            <span className="min-w-0 truncate">
                                                overlaps{" "}
                                                {collisions
                                                    .map((row) => row.other)
                                                    .join(", ")}{" "}
                                                on{" "}
                                                {[
                                                    ...new Set(
                                                        collisions.flatMap(
                                                            (row) => row.paths
                                                        )
                                                    )
                                                ]
                                                    .sort()
                                                    .join(", ")}
                                            </span>
                                        </span>
                                    ) : null}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </PopoverContent>
        </Popover>
    );
}
