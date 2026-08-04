import { useEffect, useMemo, useRef, useState } from "react";
import { HoverCard } from "radix-ui";

import { cn } from "@/lib/utils";

import {
    OUTLINE_MIN_HEADINGS,
    railDepth,
    type OutlineEntry
} from "../outline";

/**
 * A document's shape, as a column of ticks beside it.
 *
 * One tick per heading, indented and shortened by depth, so the rail is a
 * silhouette of the document — where the sections are, how deep they nest, how
 * far down the reader is. Hovering it opens the headings themselves.
 *
 * It exists because the drawer now shows bodies it was never sized for. A card
 * is a screen or two; this repository's own `DOC-0002` is 71,000 characters,
 * and an overlay with no outline is a scrollbar and a guess. A persistent
 * table of contents would cost width the drawer does not have — the rail costs
 * eight pixels and gives it back on hover.
 */

export function OutlineRail({
    entries,
    /** The scroller the headings live in; ticks track its position. */
    container
}: {
    entries: OutlineEntry[];
    container: React.RefObject<HTMLElement | null>;
}) {
    const [active, setActive] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const items = useRef<HTMLButtonElement[]>([]);
    // Memoised because the observer below depends on it: a fresh array every
    // render would tear down and rebuild the observer on every scroll frame it
    // itself caused.
    const ticks = useMemo(() => {
        const depth = railDepth(entries);
        return entries.filter((entry) => entry.level <= depth);
    }, [entries]);

    // Which heading the reader is in, by asking the document rather than by
    // counting scroll: an observer answers correctly for headings of any
    // spacing, and a body whose sections are wildly uneven — which is every
    // real document — defeats anything proportional.
    useEffect(() => {
        const root = container.current;
        if (!root || !ticks.length) return;
        const seen = new Map<string, number>();
        const observer = new IntersectionObserver(
            (records) => {
                for (const record of records) {
                    seen.set(record.target.id, record.intersectionRatio);
                }
                // The topmost heading that is on screen at all, not the most
                // visible one: the reader is *in* the section whose title has
                // just passed, and the heading below it being taller does not
                // move them into it.
                const current = ticks.find((entry) => (seen.get(entry.id) ?? 0) > 0);
                if (current) setActive(current.id);
            },
            { root, rootMargin: "0px 0px -70% 0px", threshold: [0, 1] }
        );
        for (const entry of ticks) {
            const element = root.querySelector(`#${CSS.escape(entry.id)}`);
            if (element) observer.observe(element);
        }
        return () => observer.disconnect();
    }, [ticks, container]);

    if (entries.length < OUTLINE_MIN_HEADINGS) return null;

    const go = (id: string) => {
        const root = container.current;
        const target = root?.querySelector(`#${CSS.escape(id)}`);
        target?.scrollIntoView({ block: "start", behavior: "smooth" });
        setOpen(false);
    };

    return (
        <HoverCard.Root
            open={open}
            onOpenChange={setOpen}
            openDelay={120}
            closeDelay={120}
        >
            <HoverCard.Trigger asChild>
                <nav
                    aria-label="Document outline"
                    className="sticky top-2 z-10 -mr-1 ml-2 flex shrink-0 flex-col items-end gap-1 self-start py-1"
                >
                    {ticks.map((entry) => (
                        <button
                            key={entry.id}
                            type="button"
                            // Reachable by keyboard, but the rail is a summary
                            // and the hovercard is the real control — so the
                            // ticks announce the heading they stand for rather
                            // than making the reader count them.
                            aria-label={entry.text}
                            onClick={() => go(entry.id)}
                            className={cn(
                                "h-0.5 rounded-full transition-colors",
                                entry.id === active
                                    ? "bg-foreground"
                                    : "bg-border hover:bg-muted-foreground"
                            )}
                            style={{
                                // Depth reads as length: a `##` is shorter than
                                // a `#`, and four levels down still leaves a
                                // mark rather than nothing.
                                width: `${Math.max(6, 16 - (entry.level - 1) * 3)}px`
                            }}
                        />
                    ))}
                </nav>
            </HoverCard.Trigger>
            <HoverCard.Portal>
                <HoverCard.Content
                    side="left"
                    align="start"
                    sideOffset={8}
                    collisionPadding={12}
                    className="z-50 max-h-[70vh] w-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
                >
                    {entries.map((entry, index) => (
                        <button
                            key={entry.id}
                            type="button"
                            ref={(element) => {
                                if (element) items.current[index] = element;
                            }}
                            onClick={() => go(entry.id)}
                            className={cn(
                                "block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-accent",
                                entry.id === active
                                    ? "font-medium text-foreground"
                                    : "text-muted-foreground"
                            )}
                            style={{
                                paddingLeft: `${8 + (entry.level - 1) * 10}px`
                            }}
                            title={entry.text}
                        >
                            {entry.text}
                        </button>
                    ))}
                </HoverCard.Content>
            </HoverCard.Portal>
        </HoverCard.Root>
    );
}
