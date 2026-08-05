import { Children, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Horizontal gutters a bar can sit in, and the negative margin that lets the
 * strip inside it scroll to the screen edge. Tailwind reads class names as
 * literals, so the pair has to be written out rather than composed.
 */
const GUTTER = {
    /** The bar is already inside a padded container and adds none of its own. */
    none: { bar: "", bleed: "" },
    "3": { bar: "px-3", bleed: "-mx-3 px-3" },
    "3.5": { bar: "px-3.5", bleed: "-mx-3.5 px-3.5" }
} as const;

/**
 * The filter bar every view wears.
 *
 * Two cards disagreed about what the shared thing was. T-0195 put a shared
 * `FilterSearch` at the head of the shell's bar and read the bar as a search
 * row above the chips; T-0193 filed the scrolling chip strip as the thing the
 * views were copying between them. The container is one component and both
 * readings live in it. `FilterSearch` stays a control this positions, not a
 * second container — the line between them is scrolling: everything inside
 * the strip may scroll out of sight, so a field you have to find first and a
 * button you have to reach in a hurry are held outside it.
 *
 * @param before  Ahead of the strip and never scrolled — the view title, the
 *                free-text field. Rendered as direct children of the bar, so
 *                a fragment of several nodes stacks below `sm` and lines up
 *                beside the strip above it.
 * @param after   Pinned after the strip, also never scrolled. Its presence
 *                cancels the bleed, because a strip that ends in a pinned
 *                control does not reach the screen edge anyway.
 * @param inline  From `sm` up the whole bar is one line with the strip pushed
 *                right. Below `sm` it always stacks.
 */
export function FilterBar({
    before,
    after,
    inline = false,
    gutter = "none",
    className,
    children
}: {
    before?: ReactNode;
    after?: ReactNode;
    inline?: boolean;
    gutter?: keyof typeof GUTTER;
    className?: string;
    children?: ReactNode;
}) {
    // `Children.toArray` drops the nulls a conditional child leaves behind,
    // which is what tells an empty strip from one whose controls are hidden.
    const controls = Children.toArray(children);
    return (
        <div
            data-slot="filter-bar"
            className={cn(
                "flex min-w-0 flex-col gap-2",
                GUTTER[gutter].bar,
                inline && "sm:flex-row sm:flex-wrap sm:items-center",
                className
            )}
        >
            {before}
            {controls.length > 0 ? (
                <div
                    className={cn(
                        "flex min-w-0 items-center gap-2",
                        inline && "sm:ml-auto"
                    )}
                >
                    {/* One line, always. Chips used to wrap into two and three
                        stacked rows that ate the view's height, and the strip
                        that replaced that was copied per view with a slightly
                        different class list each time. `overscroll-x-contain`
                        keeps a drag that runs past the last chip from turning
                        into a browser back-navigation. */}
                    <div
                        data-slot="filter-strip"
                        className={cn(
                            "no-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-x-contain",
                            after ? null : GUTTER[gutter].bleed
                        )}
                    >
                        {controls}
                    </div>
                    {after}
                </div>
            ) : null}
        </div>
    );
}

export interface FilterOption {
    value: string;
    label?: string;
    /** Optional swatch colour, e.g. `statusColor("doing")`. */
    color?: string;
}

/**
 * A filter chip that opens a menu: `status: all` in the toolbar. The empty
 * value means "all" and renders the chip in its resting muted state.
 *
 * It opens on `click` rather than on `pointerdown`, so a drag that starts on a
 * chip scrolls the strip instead of opening a menu on top of it. Radix opens
 * menus from a `pointerdown` handler it composes *after* the one passed in and
 * skips once the event is default-prevented, which is the whole of the fix.
 *
 * Both halves are measured, in Chromium at 390px with touch emulation, by
 * dragging 170px from the centre of a chip: the strip moved 0px before and the
 * full 170px after, and the browser delivers no click at the end of a drag, so
 * the tap path cannot misfire once the finger has moved. `touch-action: pan-x`
 * on the scroller was the other candidate the card offered and it is neither
 * necessary nor sufficient — on its own the menu still opened and the strip
 * still did not move, and with this in place the pan works without it.
 *
 * Mouse pointers keep the primitive's behaviour: pressing, dragging onto an
 * item and releasing is a real way to use a menu, and only touch needs the
 * press to stay available for something else.
 *
 * It declares no radius. These were pills next to a field that is not one, in
 * the same bar; taking the override away leaves the button's own `rounded-md`,
 * which is the value the field already uses, rather than putting a third number
 * in the file beside the two that disagreed.
 */
export function FilterChip({
    label,
    value,
    options,
    allLabel = "all",
    align = "start",
    onChange
}: {
    label: string;
    value: string;
    options: FilterOption[];
    /** `null` for an axis with no "all", where every value is a real one. */
    allLabel?: string | null;
    align?: "start" | "end";
    onChange: (value: string) => void;
}) {
    const [open, setOpen] = useState(false);
    // Read on the click that follows, where the pointer type is no longer on
    // the event: a `click` synthesised from a tap says nothing about the
    // finger that made it.
    const opensOnClick = useRef(false);
    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={label}
                    className={cn(
                        "shrink-0",
                        allLabel !== null && value && "border-ring bg-accent"
                    )}
                    onPointerDown={(event) => {
                        opensOnClick.current = event.pointerType !== "mouse";
                        if (opensOnClick.current) event.preventDefault();
                    }}
                    onClick={() => {
                        // A mouse already opened it on the press.
                        if (!opensOnClick.current) return;
                        opensOnClick.current = false;
                        setOpen((current) => !current);
                    }}
                >
                    {label}
                    <span className="font-normal text-muted-foreground">
                        {value || allLabel}
                    </span>
                    <ChevronDown
                        aria-hidden="true"
                        className="size-3 text-muted-foreground"
                    />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={align} sideOffset={4}>
                <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
                    {allLabel === null ? null : (
                        <DropdownMenuRadioItem value="">
                            {allLabel}
                        </DropdownMenuRadioItem>
                    )}
                    {options.map((option) => (
                        <DropdownMenuRadioItem
                            key={option.value}
                            value={option.value}
                        >
                            {option.color ? (
                                <span
                                    className="size-1.5 rounded-full bg-current"
                                    style={{ color: option.color }}
                                    aria-hidden="true"
                                />
                            ) : null}
                            {option.label ?? option.value}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/**
 * An on/off chip: `closed: yes` in the toolbar.
 *
 * A plain button needs none of the chip's pointer handling — the browser
 * already withholds the click when the finger scrolled instead of tapping,
 * which the same drag measurement confirms. It does need `shrink-0`: a flex
 * item in a scroller that is allowed to shrink is squeezed to its label
 * instead of scrolling.
 */
export function FilterToggle({
    label,
    on,
    onLabel = "yes",
    offLabel = "no",
    onChange
}: {
    label: string;
    on: boolean;
    onLabel?: string;
    offLabel?: string;
    onChange: (on: boolean) => void;
}) {
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={on}
            className={cn(
                "shrink-0",
                on && "border-ring bg-accent"
            )}
            onClick={() => onChange(!on)}
        >
            {label}
            <span className="font-normal text-muted-foreground">
                {on ? onLabel : offLabel}
            </span>
        </Button>
    );
}
