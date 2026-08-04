import type { View } from "./types.ts";

/**
 * Where opening a record takes the reader.
 *
 * Its own module, with a type-only import, because that is what lets both
 * compilers agree: the UI builds with `moduleResolution: Bundler`, which
 * refuses an explicit `.ts` on a value import, and the strict ratchet compiles
 * the tests with `node16`, which demands one. A module that imports nothing but
 * types is erased before either rule applies — the same reason `timeline.ts`
 * imports nothing at all.
 */

/**
 * Views that can show a card without going anywhere.
 *
 * Following `depends` from inside Flow used to eject the reader onto Explorer
 * on the first hop, because every card click routed to one view whether or not
 * the one they were in could already show it.
 *
 * Workflow is here because it opens records in its own drawer: the graph is the
 * thing being read, and stepping through provenance must not walk off it.
 */
export const CARD_VIEWS: ReadonlySet<View> = new Set<View>([
    "overview",
    "explorer",
    "triage",
    "flow",
    "epics",
    "timeline",
    "workflow"
]);

/**
 * Which view has to be opened to show a record, or `null` to stay put.
 *
 * The rule this replaces was inline and routed cards only, so a `[[DOC-0002]]`
 * in a card body set the selection to something the inspector could not render:
 * the sheet closed, the view never changed, and nothing errored. Body links,
 * `origin` rows and `related` rows all carry records of any kind, and all three
 * arrive here.
 *
 * `isCard` is passed rather than inferred where the caller already knows —
 * the card corpus is in hand there, and a project can configure its own ID
 * prefix, which is why the `T-` test is a fallback and not the rule.
 *
 * A `null` current view means the reader asked to leave, so the stay-put rule
 * does not apply. Workflow's "Open in its view" needs that: the canvas is in
 * `CARD_VIEWS` so following a link does not walk off the graph, which also
 * made the one control whose entire purpose is to walk off the graph do
 * nothing at all for a card.
 */
export function viewForRecord(
    id: string,
    current: View | null,
    isCard = false
): View | null {
    if (isCard || id.startsWith("T-")) {
        return current && CARD_VIEWS.has(current) ? null : "explorer";
    }
    if (id.startsWith("DOC-") || id.startsWith("PATH-")) return "docs";
    if (id.startsWith("CHG-") || id.startsWith("REL-")) return "history";
    return "memory";
}
