/**
 * A card body read as a document rather than as a string.
 *
 * Split out of `mutations.ts` because the doctor needs the same reading the
 * writers do, and a card diagnosing itself through the module that mutates
 * cards would be a cycle. Everything here is pure: a body in, a shape out.
 */

/**
 * The sections of a card body that only protocol commands write.
 *
 * `## Activity` is the durable trail and `## Notes` holds what `card note`
 * appends, including the reason one actor gave for taking another's claim.
 * Both live in the body, and a body write replaced the body — so a single
 * `card write` erased the record of who moved the card and why. "Durable" was
 * true only until any agent called the tool whose whole purpose is replacing a
 * body, and `project_card_write` is agent-facing.
 */
export const PROTOCOL_SECTIONS = ["## Activity", "## Notes"];

export interface BodySection {
    heading: string | null;
    text: string;
}


/**
 * Which lines sit inside a fenced code block, the fence markers included.
 *
 * Takes lines rather than a body because its callers disagree about what a
 * line is — the acceptance reader splits on \`/\\r?\\n/\` and addresses items by
 * offset, and re-splitting underneath it would move every index by one on a
 * file written on Windows.
 */
export function fencedLines(lines: readonly string[]): boolean[] {
    let fence: string | null = null;
    return lines.map((line) => {
        const delimiter = /^ {0,3}(`{3,}|~{3,})/.exec(line);
        if (!delimiter) return Boolean(fence);
        const marker = delimiter[1][0];
        if (!fence) fence = marker;
        else if (fence === marker) fence = null;
        return true;
    });
}

/**
 * Every line of a body, with the section it belongs to and whether it is
 * inside a fenced block.
 *
 * A scan rather than an `indexOf`, and that is the whole correction. Three
 * functions here located `## Activity` and `## Notes` by index, which finds
 * them in three places they are not: inside a fenced example, inside inline
 * code, and anywhere else prose happens to quote them. The cards this
 * repository writes *about the trail* are precisely the cards that quote it —
 * T-0108's whole four-entry trail sits in its prose, with no section at all,
 * because its second sentence says `## Activity` in backticks.
 *
 * Only `##` at the start of a line opens a section. A deeper heading belongs
 * to the section above it, which is what lets `## Notes` hold structure
 * without splitting in two.
 */
export function* scanBody(body: string): Generator<{
    line: string;
    heading: string | null;
    section: number;
    fenced: boolean;
}> {
    const lines = body.split("\n");
    const fenced = fencedLines(lines);
    let heading: string | null = null;
    let section = 0;
    for (const [at, line] of lines.entries()) {
        if (!fenced[at] && /^##(?!#)\s+\S/.test(line)) {
            heading = line.trim();
            section += 1;
        }
        yield { line, heading, section, fenced: fenced[at] };
    }
}

/** A body grouped into its top-level sections. */
export function splitSections(body: string): BodySection[] {
    const sections: { heading: string | null; lines: string[] }[] = [
        { heading: null, lines: [] }
    ];
    let current = 0;
    for (const scanned of scanBody(body)) {
        // Compared by index rather than by text, so a body with two `## Notes`
        // stays two sections instead of silently merging into one.
        if (scanned.section !== current) {
            sections.push({ heading: scanned.heading, lines: [] });
            current = scanned.section;
        }
        sections[sections.length - 1].lines.push(scanned.line);
    }
    return sections.map((section) => ({
        heading: section.heading,
        // `trimStart`/`trimEnd` rather than `/^\s+/` and `/\s+$/`: those are
        // the polynomial-backtracking shape CodeQL flags, and a card body is
        // caller-supplied text arriving over HTTP and MCP. The built-ins do
        // the same job in one pass.
        text: trimBlankLines(section.lines.join("\n"))
    }));
}

/** Leading blank lines and trailing whitespace, without a backtracking regex. */
function trimBlankLines(text: string): string {
    let start = 0;
    while (text[start] === "\n" || text[start] === "\r") start += 1;
    return text.slice(start).trimEnd();
}

/**
 * What `activityEntry` produces, as a line of the trail.
 *
 * The actor run excludes both separators, which is the whole difference
 * between this and a note. `appendCardNote` writes `- STAMP ACTOR — text` and
 * the trail writes `- STAMP ACTOR · text`, so the two are told apart by which
 * separator follows the actor — but `.+ · ` is greedy and found a `·`
 * anywhere on the line, including inside a note that quoted a trail entry.
 *
 * That is not a cosmetic misread. `repairMisplacedTrail` moves what this
 * matches into `## Activity`, so a note recording evidence about the trail —
 * the one subject that makes a note quote one — was liable to be moved out of
 * `## Notes` by `doctor --fix`. Fenced quotes were already safe; inline ones
 * were not ([[T-0181]]).
 */
export const TRAIL_ENTRY = /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2}Z [^·—]+ · /;

export const trailStamp = (line: string) =>
    /^- (\d{4}-\d{2}-\d{2} \d{2}:\d{2})Z/.exec(line)?.[1] || "";

/**
 * Trail entries that were written somewhere other than `## Activity`.
 *
 * The damage the scan above stops happening again, on the cards that already
 * carry it. Quoted trails are not damage — a card whose fenced example shows
 * what a trail looks like is doing its job — so fenced lines are skipped.
 */
export function misplacedTrailEntries(body: string): string[] {
    const found: string[] = [];
    for (const { line, heading, fenced } of scanBody(body || "")) {
        if (fenced || heading === "## Activity") continue;
        if (TRAIL_ENTRY.test(line)) found.push(line);
    }
    return found;
}

export function isProtocolSection(heading: string | null): heading is string {
    return heading !== null && PROTOCOL_SECTIONS.includes(heading);
}

/**
 * Appends a line at the end of a top-level section, creating it if absent.
 *
 * Shared by the trail and by `card note` because they are the same operation
 * and were the same bug twice. Returns the body alone — the caller re-attaches
 * the frontmatter it already parsed.
 */
export function appendUnderHeading(body: string, heading: string, line: string): string {
    const sections = splitSections(body.trimEnd());
    const at = sections.findIndex((section) => section.heading === heading);
    if (at === -1) {
        const existing = sections
            .map((section) => section.text)
            .filter(Boolean)
            .join("\n\n");
        return `${existing ? `${existing}\n\n` : ""}${heading}\n\n${line}`;
    }
    return sections
        .map((section, index) =>
            index === at ? `${section.text}\n${line}` : section.text
        )
        .filter(Boolean)
        .join("\n\n");
}


/**
 * Reattaches a body to the frontmatter it was parsed from.
 *
 * `prefixLength` stops at the closing `---`, so the blank line `renderCard`
 * writes between frontmatter and body belongs to the body — and every writer
 * that trimmed its input therefore ate it. They disagreed about whether it
 * came back, so a card gained or lost that line depending on which command
 * touched it last. One helper, one answer.
 */
export function withFrontmatter(prefix: string, body: string): string {
    const eol = prefix.includes("\r\n") ? "\r\n" : "\n";
    if (!body) return prefix;
    // Sections are joined with `\n`, so rebuilding a CRLF body left `\r\n`
    // inside each section and a bare `\n` between them — a file with two kinds
    // of line ending, written by a command that claimed to touch one section.
    // The document decides, the same way `patchFrontmatter` already lets it.
    const text = body.replace(/\r\n/g, "\n").split("\n").join(eol);
    return `${prefix}${eol}${text}${eol}`;
}
