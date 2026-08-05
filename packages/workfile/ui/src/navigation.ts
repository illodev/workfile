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

/**
 * `.project/<collection>` a record id belongs to, or `null` when it is not a
 * record id at all.
 *
 * The default branch answers `memory`, which is right for LRN, ADR, INC, CONV
 * and CTX and stays right for a project that configures its own memory
 * prefixes. It was also the answer for the empty string, and that is a trap
 * rather than a fallback: `Docs` cleared its selection with `onSelect("")`, so
 * *leaving* a document classified the non-selection as a memory record — not
 * the collection the docs view owns — and the inspector opened, empty, over the
 * list the reader had just gone back to.
 *
 * The shape test is the fix, and it leaves the fallback doing its job: a record
 * id is a prefix and a number, and anything that is not one is not a record.
 *
 * Here rather than in `theme.ts`, which opens by saying it names colours and
 * nothing else. This is the same prefix table `viewForRecord` reads, one line
 * above, answering the neighbouring question.
 */
export function recordCollection(id: string): string | null {
    if (!/^[A-Z][A-Z0-9]*-\d/.test(id)) return null;
    if (id.startsWith("T-")) return "cards";
    if (id.startsWith("DOC-") || id.startsWith("PATH-")) return "docs";
    if (id.startsWith("CHG-") || id.startsWith("REL-")) return "changelog";
    return "memory";
}

/**
 * Views that already render the selection, mapped to the collection they render.
 *
 * **The test is mechanical: does this view put the selected record on screen by
 * itself?** If it does, the shared drawer stands down. If it does not, the
 * drawer is the only thing that can show it.
 *
 * Stated that way because the alternative was tried and was wrong. This map
 * held `docs` alone and explained it as "the one view whose job is reading
 * something long" — a rule about the record rather than about the view — and
 * history was then argued into keeping the overlay on the grounds that giving
 * it a reader would cost a second pane. History already had the second pane.
 * Clicking a fragment rendered it in the right-hand column *and* opened the
 * drawer over that column with the same fragment in it, so the reader got the
 * text twice and could read neither: the pane was cut off mid-word underneath.
 *
 * A rule you can check by opening the view would have caught that. A rule about
 * what kind of record it is has to be reasoned about, and reasoning is what got
 * it wrong. See ADR-0018.
 */
export const VIEW_OWNS_DRAWER: Partial<Record<View, string>> = {
    // The list sits beside the document rather than over it, and the outline
    // rail belongs to the same reader.
    docs: "docs",
    // Two columns since it was built: fragments on the left, and a right-hand
    // pane that shows the derived changelog until a fragment is selected and
    // that fragment afterwards.
    history: "changelog"
};

/**
 * Whether the shared drawer should cover this view for this selection.
 *
 * A rule, rather than the expression it was: `VIEW_OWNS_DRAWER[view] !==
 * recordCollection(selectedId)` is true for an id that names no collection as
 * readily as for one that names another view's, so the docs view answered its
 * own "All documents" button by opening an empty inspector over the list.
 *
 * The collection comes in rather than the id, so this module keeps importing
 * nothing but types — which is what lets the bundler and the strict ratchet
 * compile it under their disagreeing module resolutions.
 */
export function drawerCovers(view: View, collection: string | null): boolean {
    if (!collection) return false;
    return VIEW_OWNS_DRAWER[view] !== collection;
}
