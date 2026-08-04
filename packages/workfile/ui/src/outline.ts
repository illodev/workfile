/**
 * A heading, as both the renderer and the rail need it.
 *
 * Declared here rather than in `Markdown.tsx` so nothing JSX-free has to reach
 * into a `.tsx` for it: the strict ratchet compiles without `--jsx`, and the
 * test runner cannot load one at all. The renderer re-exports it, so every
 * existing importer is unaffected.
 */
export interface OutlineEntry {
    id: string;
    text: string;
    /** 1 for `#`, 2 for `##`, … as written in the source. */
    level: number;
}

/**
 * How the outline rail decides what to draw.
 *
 * A `.ts` module beside the `.tsx` that renders it, for the reason
 * `timeline.ts` and `workflow.ts` are: Node's test runner strips types but
 * does not transform JSX, so anything worth asserting on has to live where no
 * JSX does. The import above is type-only and erases before that matters.
 */

/** Below this a rail is decoration: the whole document is already on screen. */
export const OUTLINE_MIN_HEADINGS = 4;

/**
 * How many ticks the rail will draw before it starts dropping depth.
 *
 * Measured on this repository: the longest record carries 172 headings, which
 * at six pixels a tick is 870px of rail — taller than the drawer, so it would
 * run off the bottom and take the last two thirds of the document's shape with
 * it, silently.
 */
export const MAX_TICKS = 40;

/**
 * The deepest heading level the rail can show and still fit.
 *
 * Depth is dropped from the bottom up, so a long document degrades to its
 * chapters rather than to its first forty paragraphs — an outline is for
 * saying where things are, and half a document's worth of detail says less
 * than all of it in outline. The hovercard is unaffected and still lists every
 * heading.
 */
export function railDepth(
    entries: readonly OutlineEntry[],
    budget = MAX_TICKS
): number {
    const deepest = entries.reduce((max, entry) => Math.max(max, entry.level), 1);
    for (let level = deepest; level > 1; level -= 1) {
        if (entries.filter((entry) => entry.level <= level).length <= budget) {
            return level;
        }
    }
    return 1;
}
