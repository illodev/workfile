import { createContext, useContext } from "react";

/**
 * Whether this board may write, answered once for the whole tree.
 *
 * `/api/v2/workspace` has always reported `readOnly` and the UI has always
 * dropped it, so `workfile ui --read-only` served a board that looked fully
 * editable and answered 409 on every save. The alternative to a context was
 * threading a prop through `App` into Inspector, Docs, History and Memory —
 * four components that already take eight props each, none of which would
 * have reached the fifth one somebody adds later.
 *
 * Read it with `useReadOnly()` and let it disable the control, rather than
 * hiding it: a board whose editors are visibly locked says what it is, and one
 * whose editors are absent looks like a version that never had them.
 */
const ReadOnlyContext = createContext(false);

export const ReadOnlyProvider = ReadOnlyContext.Provider;

export function useReadOnly() {
    return useContext(ReadOnlyContext);
}

/**
 * One sentence for every disabled control, so a reader who meets the second
 * one has already been told what it means by the first.
 */
export const READ_ONLY_HINT = "This board is read-only";
