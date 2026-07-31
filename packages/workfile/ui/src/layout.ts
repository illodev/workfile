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
 * List-plus-detail views collapse to one pane below Tailwind's `lg` (1024px),
 * not at the registry sidebar's 768.
 *
 * 768 is the worst width in the app, not a safe one: the sidebar still holds
 * its full 240px there — its overlay mode starts *below* 768 — so a split pane
 * gets about 260px a side. Measured at 768 before this changed, the Docs reader
 * wrapped its title over three lines. The two thresholds are deliberate: the
 * sidebar yields at 768 because that is the registry's contract, and the views
 * yield at 1024 because that is where they actually stop fitting.
 */
