/**
 * Acceptance criteria, as data rather than as prose that happens to have boxes.
 *
 * The protocol's strongest rule is that `done` requires evidence from somewhere
 * the code actually ran. Until now the only mechanism behind it counted
 * unchecked lines and emitted one warning saying how many. An agent could not
 * ask what was still unproven, a reviewer could not see which criterion was the
 * problem, and nothing at all stopped a card reaching `done` with every box
 * empty.
 *
 * The storage does not change. `## Acceptance criteria` followed by `- [ ]`
 * items is what cards already contain, it renders on GitHub, and `grep` finds
 * it. What changes is that the items are addressable.
 *
 * **Indices are positional, and deliberately not written into the text.** The
 * obvious alternative — serialising `- [ ] #1 Some criterion` — survives
 * insertions, but the numbers then drift from the order, need renumbering, and
 * turn every card ever written into a migration. Position is safe here for a
 * reason that already exists: every mutation through this module goes through
 * the card lock and `expectedRevision`, so a concurrent reorder is rejected
 * rather than silently applied to the wrong line.
 */

/** The heading that opens the region. Matched case-insensitively. */
const HEADING = /^(#{1,6})\s+acceptance\s+criteria\b.*$/im;

/** A checklist item: `- [ ] text`, `* [x] text`, any indentation. */
const ITEM = /^(\s*)([-*])(\s+)\[([ xX])\](\s+)(.*)$/;

export interface AcceptanceItem {
    /** 1-based, by order of appearance. Stable within one revision. */
    index: number;
    text: string;
    checked: boolean;
    /** 0-based line offset in the body, for writers. */
    line: number;
}

export interface AcceptanceReading {
    /** Whether the card declares the section at all. */
    present: boolean;
    items: AcceptanceItem[];
    /** Unchecked items, the ones that make `done` a lie. */
    unchecked: AcceptanceItem[];
}

/**
 * Reads the acceptance region.
 *
 * The region ends at the next heading of the same level or shallower, so a
 * `### Notes on criterion 2` nested inside it stays inside. A card with no
 * section reads as `present: false` with no items — distinct from a card that
 * declares the section and leaves it empty, which is a different mistake.
 */
export function parseAcceptance(body = ""): AcceptanceReading {
    const lines = String(body).split(/\r?\n/);
    const headingIndex = lines.findIndex((line) => HEADING.test(line));
    if (headingIndex === -1) return { present: false, items: [], unchecked: [] };

    const openedAt = (lines[headingIndex].match(/^(#{1,6})/) || [])[1]?.length ?? 2;
    const items: AcceptanceItem[] = [];

    for (let line = headingIndex + 1; line < lines.length; line += 1) {
        const heading = lines[line].match(/^(#{1,6})\s+\S/);
        if (heading && heading[1].length <= openedAt) break;
        const match = lines[line].match(ITEM);
        if (!match) continue;
        items.push({
            index: items.length + 1,
            text: match[6].trim(),
            checked: match[4] !== " ",
            line
        });
    }

    return {
        present: true,
        items,
        unchecked: items.filter((item) => !item.checked)
    };
}

/** Human-facing summary: `2 of 5`. */
export function acceptanceSummary(reading: AcceptanceReading): string {
    const checked = reading.items.length - reading.unchecked.length;
    return `${checked} of ${reading.items.length}`;
}

export class AcceptanceIndexError extends Error {
    code = "CARD_ACCEPTANCE_INDEX_UNKNOWN";
    constructor(
        public index: number,
        public available: number
    ) {
        super(
            available
                ? `No acceptance criterion ${index}; the card has ${available}.`
                : `The card declares no acceptance criteria to address.`
        );
    }
}

/**
 * Returns the body with the named criteria checked or unchecked.
 *
 * Only the box changes: indentation, bullet character, spacing and the text
 * itself are rewritten from the captured groups, so a line survives a round trip
 * byte for byte when its state does not change. That matters more than it
 * sounds — the whole record format is built on the promise that a write touches
 * only what it claims to.
 *
 * An unknown index throws rather than being ignored. Silently dropping an
 * instruction is the failure mode an agent cannot detect.
 */
export function applyAcceptance(
    body = "",
    { check = [], uncheck = [] }: { check?: number[]; uncheck?: number[] } = {}
): { body: string; changed: AcceptanceItem[] } {
    const wanted = new Map<number, boolean>();
    // Applied in argument order, so `--check 1 --uncheck 1` ends unchecked and
    // the caller gets what they last said rather than a guess.
    for (const index of check) wanted.set(index, true);
    for (const index of uncheck) wanted.set(index, false);
    if (!wanted.size) return { body, changed: [] };

    const reading = parseAcceptance(body);
    const byIndex = new Map(reading.items.map((item) => [item.index, item]));
    for (const index of wanted.keys()) {
        if (!byIndex.has(index)) {
            throw new AcceptanceIndexError(index, reading.items.length);
        }
    }

    const lines = String(body).split(/\r?\n/);
    const changed: AcceptanceItem[] = [];
    for (const [index, next] of wanted) {
        const item = byIndex.get(index)!;
        if (item.checked === next) continue;
        const match = lines[item.line].match(ITEM)!;
        lines[item.line] =
            `${match[1]}${match[2]}${match[3]}[${next ? "x" : " "}]${match[5]}${match[6]}`;
        changed.push({ ...item, checked: next });
    }

    return { body: lines.join("\n"), changed };
}
