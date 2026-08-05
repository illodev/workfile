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

import { fencedLines, isProtocolSection } from "./body.js";

/**
 * The headings that open the region, case-insensitive.
 *
 * This was one phrase, `acceptance criteria`, and everything else read as a
 * card with no criteria at all — which `done` then had nothing to hold. The
 * heading is prose a human types, so the vocabulary has to cover what humans
 * actually type: this repository's own T-0026 through T-0029 wrote
 * `## Acceptance` and were closed with four unproven criteria between them,
 * and DOC-0005 arrived from outside reporting the same hole in Spanish.
 *
 * Widening it is not the fix, though, and must not be mistaken for one. There
 * is always another phrasing — `Definition of done` today, something else
 * tomorrow. What closes the hole is `orphans` below: the reader stops claiming
 * a card has no criteria when its body plainly carries unchecked boxes.
 */
const HEADING =
    /^(#{1,6})\s+(?:acceptance(?:\s+criteria)?|definition\s+of\s+done|(?:success|exit)\s+criteria)\b.*$/i;

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
    /**
     * Checklist items the region does not cover, in order of appearance.
     *
     * These are not criteria and are deliberately not addressable — `card ac
     * --check` will not touch them, because the reader does not know that they
     * are criteria. They exist so that `present: false` can be reported as
     * "no heading I recognised" rather than as "no criteria", which is a claim
     * about the card that the reader is not entitled to make.
     *
     * Only meaningful when `present` is false. A card that declares its
     * criteria properly and also keeps a checklist somewhere else is doing
     * nothing wrong, and consumers must not read that list as criteria.
     */
    orphans: AcceptanceItem[];
}

/**
 * Reads the acceptance region.
 *
 * The region ends at the next heading of the same level or shallower, so a
 * `### Notes on criterion 2` nested inside it stays inside. A card with no
 * section reads as `present: false` with no items — distinct from a card that
 * declares the section and leaves it empty, which is a different mistake.
 *
 * Fenced blocks are not the region and cannot open it. A card quoting an
 * example body — which is what a card *about* card bodies contains — read its
 * criteria out of the quote: T-0157 reported "0 of 1 met" against a criterion
 * printed inside a code fence, while its five real ones went uncounted. That
 * reading gates `done`, and `card ac --check` would have edited the quote.
 */
export function parseAcceptance(body = ""): AcceptanceReading {
    const lines = String(body).split(/\r?\n/);
    const fenced = fencedLines(lines);
    const headingIndex = lines.findIndex(
        (line, at) => !fenced[at] && HEADING.test(line)
    );

    const items: AcceptanceItem[] = [];
    // Where the region stops, so the orphan pass knows what it must not read
    // twice. `lines.length` when the section runs to the end of the body.
    let regionEnd = -1;

    if (headingIndex !== -1) {
        const openedAt =
            (lines[headingIndex].match(/^(#{1,6})/) || [])[1]?.length ?? 2;
        regionEnd = lines.length;
        for (let line = headingIndex + 1; line < lines.length; line += 1) {
            if (fenced[line]) continue;
            const heading = lines[line].match(/^(#{1,6})\s+\S/);
            if (heading && heading[1].length <= openedAt) {
                regionEnd = line;
                break;
            }
            const match = lines[line].match(ITEM);
            if (!match) continue;
            items.push({
                index: items.length + 1,
                text: match[6].trim(),
                checked: match[4] !== " ",
                line
            });
        }
    }

    return {
        present: headingIndex !== -1,
        items,
        unchecked: items.filter((item) => !item.checked),
        orphans: collectOrphans(lines, fenced, headingIndex, regionEnd)
    };
}

/**
 * Checklist items living outside the region.
 *
 * `## Activity` and `## Notes` are excluded. They are the sections the tool
 * writes into, a note is free prose, and a checklist someone pasted into one
 * is the clearest case of a list that was never a criterion. Everything else
 * counts: a card that keeps its criteria under a heading nobody agreed on is
 * exactly what this is for.
 */
function collectOrphans(
    lines: string[],
    fenced: boolean[],
    headingIndex: number,
    regionEnd: number
): AcceptanceItem[] {
    const orphans: AcceptanceItem[] = [];
    let section: string | null = null;
    for (let line = 0; line < lines.length; line += 1) {
        if (!fenced[line] && /^##(?!#)\s+\S/.test(lines[line])) {
            section = lines[line].trim();
        }
        if (fenced[line]) continue;
        if (headingIndex !== -1 && line >= headingIndex && line < regionEnd) {
            continue;
        }
        if (isProtocolSection(section)) continue;
        const match = lines[line].match(ITEM);
        if (!match) continue;
        orphans.push({
            index: orphans.length + 1,
            text: match[6].trim(),
            checked: match[4] !== " ",
            line
        });
    }
    return orphans;
}

/**
 * The unchecked items a card is carrying that nothing has agreed to call
 * criteria — the reading `done` and `doctor` act on.
 *
 * Empty whenever the card declares a region of its own, whatever else its body
 * contains. Checked orphans are excluded because nothing about them is
 * unproven; the question is only ever what is still open.
 */
export function unreadableCriteria(reading: AcceptanceReading): AcceptanceItem[] {
    if (reading.present) return [];
    return reading.orphans.filter((item) => !item.checked);
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
