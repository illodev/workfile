import { createContext, useContext, useMemo, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

import { recordNeighbours } from "./navigation";

/**
 * Where the reader is in the list they opened this record from.
 *
 * `Inspector` has carried a previous/next cursor for cards since the rail became
 * a drawer, so working through the Explorer never means going back to the table.
 * Every other kind had none: reading three changelog fragments in a row meant
 * dismissing the reader, finding your place in the list and clicking again. That
 * is T-0207, and ADR-0018's surviving finding.
 *
 * A context rather than five sets of props, for the reason `read-only.tsx` gives
 * for the same choice: the panels this has to reach — the card inspector, the
 * memory panel, the generic record panel, and the readers Docs and History own
 * themselves — already take eight props each, and the list has to arrive at all
 * of them or the cursor is back to being one view's feature.
 *
 * The list is whatever the view was showing, in the order it was showing it:
 * filtered, sorted, and grouped as the reader sees it, never the whole corpus.
 * A cursor over a list the reader cannot see is a cursor that jumps.
 */
interface Cursor {
    previousId: string | null;
    nextId: string | null;
    step: (id: string) => void;
}

/** Nowhere to step, which is the default for a tree with no provider over it. */
const NO_CURSOR: Cursor = {
    previousId: null,
    nextId: null,
    step: () => {}
};

const RecordCursorContext = createContext<Cursor>(NO_CURSOR);

export function RecordCursorProvider({
    ids,
    selectedId,
    onStep,
    children
}: {
    /** The list the reader is moving along, in display order. */
    ids: string[];
    selectedId: string | null;
    onStep: (id: string) => void;
    children: ReactNode;
}) {
    // The rule itself is in `navigation.ts`, with the other navigation rules and
    // where a test can reach it without a renderer.
    const value = useMemo<Cursor>(
        () => ({ ...recordNeighbours(ids, selectedId), step: onStep }),
        [ids, onStep, selectedId]
    );
    return (
        <RecordCursorContext.Provider value={value}>
            {children}
        </RecordCursorContext.Provider>
    );
}

export function useRecordCursor() {
    return useContext(RecordCursorContext);
}

/**
 * The control, which is the one the card inspector has always used.
 *
 * Absent when there is nowhere to step — no list, or a list of one — and
 * disabled at each end of a real one, so the reader can tell "there is no next"
 * from "there was never a sequence here". Two focusable buttons and no key
 * binding of their own: the drawer already owns Escape and the shell owns ⌘K,
 * and a reader typing in the editor inside that drawer must not have a keystroke
 * taken to move the record out from under them.
 */
export function RecordCursor({ noun = "record" }: { noun?: string }) {
    const { previousId, nextId, step } = useRecordCursor();
    if (!previousId && !nextId) return null;
    return (
        <ButtonGroup>
            <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={!previousId}
                aria-label={`Previous ${noun}`}
                onClick={() => previousId && step(previousId)}
            >
                <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={!nextId}
                aria-label={`Next ${noun}`}
                onClick={() => nextId && step(nextId)}
            >
                <ChevronRight aria-hidden="true" />
            </Button>
        </ButtonGroup>
    );
}
