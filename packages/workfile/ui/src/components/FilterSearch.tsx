import { Search, X } from "lucide-react";

import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput
} from "@/components/ui/input-group";

/** Which corpus a field searches — see `PLACEHOLDER`. */
export type FilterSearchScope = "cards" | "records";

/**
 * What free text matches, written down once per corpus.
 *
 * Three views had three placeholders promising three different things, and
 * none of them was what the code does. The record collections search on the
 * server: `searchProjectRecords` scores id, title, metadata and body, but the
 * body is indexed as whole tokens while the title also matches substrings —
 * so "title and body" alone reads as broken the first time half a word finds
 * nothing in a document that plainly contains it.
 *
 * The card views filter in the browser over identity and metadata only.
 * Lower-casing every Markdown body per keystroke was measured at 8.9ms
 * against 5.6ms without it (`query.ts`), so prose is reached through `body:`
 * rather than by default. Two corpora, two honest sentences, one file — so a
 * fourth view cannot invent a third promise without deleting one of these.
 */
const PLACEHOLDER: Record<FilterSearchScope, string> = {
    cards: "Search id, title and tags…",
    records: "Search title and body, whole words…"
};

/**
 * The free-text field every filter bar renders.
 *
 * It holds no state. The value lives with the rest of the filters — in the
 * shell, serialised to the address bar — because a search that dies on reload
 * behaves unlike every other filter beside it.
 */
export function FilterSearch({
    scope,
    value,
    label,
    className,
    onChange
}: {
    scope: FilterSearchScope;
    value: string;
    /** Names the collection for a screen reader; the shared placeholder cannot. */
    label: string;
    className?: string;
    onChange: (value: string) => void;
}) {
    return (
        // The same rung the chips beside it take. It used to be one rung
        // taller, which is a 4px step in the middle of a row of controls that
        // are all one filter — and a row that steps reads as two rows.
        <InputGroup size="sm" className={className}>
            <InputGroupAddon>
                <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
                className="[&::-webkit-search-cancel-button]:appearance-none"
                type="search"
                value={value}
                aria-label={label}
                placeholder={PLACEHOLDER[scope]}
                onChange={(event) => onChange(event.target.value)}
            />
            {/* WebKit and Blink draw a clear affordance for `type="search"`
                and Firefox draws none. The term now outlives the view it was
                typed in, so the native one is suppressed and replaced rather
                than leaving a third of readers to select-all-and-delete a
                filter they may not remember setting. */}
            {value ? (
                <InputGroupAddon align="inline-end">
                    <InputGroupButton
                        aria-label="Clear search"
                        onClick={() => onChange("")}
                    >
                        <X aria-hidden="true" />
                    </InputGroupButton>
                </InputGroupAddon>
            ) : null}
        </InputGroup>
    );
}
