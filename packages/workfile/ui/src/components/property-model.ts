/**
 * The parts of the property editor that do not need a DOM.
 *
 * Split out so they can be tested directly: Node strips TypeScript types but
 * not JSX, so anything living in a `.tsx` file is untestable here.
 */
export type PropertyKind = "text" | "enum" | "list" | "date" | "reference";

export interface PropertyDefinition {
    key: string;
    kind: PropertyKind;
    options?: readonly string[];
    /** Frontmatter keys the protocol owns; shown but never editable here. */
    readOnly?: boolean;
}

/**
 * Infers a control from a value the schema does not describe.
 *
 * Frontmatter carries whatever its author put there — Obsidian writes its own
 * keys, an earlier tool wrote others — and the codec preserves all of it. A
 * property panel that only rendered the keys it recognised would show a record
 * as having less in it than it does.
 */
export function inferKind(key: string, value: unknown): PropertyKind {
    if (Array.isArray(value)) return "list";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return "date";
    }
    if (typeof value === "string" && /^[A-Z][A-Z0-9]{0,11}-\d{4,}$/.test(value)) {
        return "reference";
    }
    return "text";
}

export const PROTOCOL_OWNED = new Set([
    "id",
    "created",
    "updated",
    "revision",
    "claimed_by",
    "claimed_at"
]);

/** Property definitions for a card, taken from the runtime schema. */
export function cardProperties(schema: {
    cards: {
        statuses: readonly string[];
        types: readonly string[];
        priorities: readonly string[];
        efforts: readonly string[];
        areas: readonly string[];
    };
}): PropertyDefinition[] {
    return [
        { key: "id", kind: "text", readOnly: true },
        { key: "title", kind: "text" },
        { key: "status", kind: "enum", options: schema.cards.statuses },
        { key: "type", kind: "enum", options: schema.cards.types },
        { key: "priority", kind: "enum", options: schema.cards.priorities },
        { key: "effort", kind: "enum", options: schema.cards.efforts },
        { key: "area", kind: "enum", options: schema.cards.areas },
        { key: "parent", kind: "reference" },
        { key: "milestone", kind: "text" },
        { key: "depends", kind: "list" },
        { key: "related", kind: "list" },
        { key: "tags", kind: "list" },
        { key: "scope", kind: "list" },
        { key: "start", kind: "date" },
        { key: "due", kind: "date" },
        { key: "created", kind: "date", readOnly: true },
        { key: "updated", kind: "date", readOnly: true },
        { key: "claimed_by", kind: "text", readOnly: true },
        { key: "claimed_at", kind: "text", readOnly: true }
    ];
}
