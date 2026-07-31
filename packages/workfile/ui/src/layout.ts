/**
 * Layout constants the views share.
 *
 * Reading views used to each pick their own width, or none: Triage pinned an
 * 820px column to the left edge of a 1200px pane and Docs let the document body
 * run the whole way. One measure, named once, so a prose view cannot drift into
 * a line length nobody reads.
 *
 * `ch` rather than pixels because the measure is about characters per line, and
 * the interface ships its own typeface — a pixel width would mean a different
 * number of words at every type size.
 */
export const READING_MEASURE = "mx-auto w-full max-w-[72ch]";

/**
 * Below this the shell stops being a desktop app: the sidebar yields, the
 * breadcrumb sheds segments, and list-plus-detail views collapse to one column.
 *
 * Tailwind's `lg` is 1024px and that is where the views measurably break —
 * Memory's fixed 380px columns stop fitting two at a time, and Docs' split pane
 * gives each half less than 400px.
 */
export const COMPACT_BREAKPOINT = 1024;
