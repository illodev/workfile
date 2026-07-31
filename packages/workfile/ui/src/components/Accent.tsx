import { cn } from "@/lib/utils";

/**
 * A status colour marked on a container without riding its border.
 *
 * The stat tiles and the board columns used to carry their colour as
 * `border-l-2` / `border-t-2`. A border follows the corner radius, so the
 * accent bent away into the rounding — and the board columns had squared their
 * top corners to hide it, which left them rounded on one end only.
 *
 * An inset bar is its own shape: it keeps its ends square, stops short of the
 * corners, and lets the container stay rounded on all four. The colour still
 * arrives as a prop, so the theme and `severityColor`/`statusColor` remain the
 * only things that decide it.
 */
export function Accent({
    edge,
    color,
    className
}: {
    edge: "left" | "top";
    color: string;
    className?: string;
}) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                "pointer-events-none absolute rounded-full",
                edge === "left" ? "inset-y-2 left-1.5 w-[3px]" : "inset-x-3 top-1.5 h-[3px]",
                className
            )}
            style={{ background: color }}
        />
    );
}
