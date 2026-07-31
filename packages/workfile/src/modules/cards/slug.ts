/**
 * Card filenames are derived from the title, and three modules need the same
 * derivation: `createCard` writes it, `diagnoseCards` checks it has not drifted,
 * and `reslugCard` repairs it. It lived inside `mutations.ts`, which imports
 * `cards.ts` — so the health rule could not reach it without a cycle.
 */
export function slugify(title) {
    return (
        String(title)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 50) || "card"
    );
}

/** The filename a card with this id and title would be created with today. */
export function cardFileName(id, title) {
    return `${id}-${slugify(title)}.md`;
}
