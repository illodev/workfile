import { parentPort, workerData } from "node:worker_threads";

/**
 * The regex scan, in a thread that can be killed.
 *
 * `/pattern/flags` compiles a user-supplied regular expression, and no cap on
 * the pattern or the input bounds what backtracking costs: `/(a+)+$/` is six
 * characters, passes every guard the search had, and takes 57 seconds against
 * a 32-character body — against the 20,000-character one it does not finish
 * ([[T-0190]]). V8 offers no step budget and no timeout, so the only way to
 * stop a match already running is to end the thread running it.
 *
 * Deliberately importing nothing from the package. A worker pays for its own
 * module graph on every spawn, and this one exists to be spawned per search;
 * `node:worker_threads` is the whole of it. Measured: ~50ms of startup and
 * structured clone against 5.4ms for the same scan in-process over 250
 * records, which is the price the feature now costs and the reason the caller
 * only pays it for a regex query.
 *
 * Everything that touches the compiled expression happens here — counts and
 * the excerpt line both — because a matcher that can hang hangs wherever it is
 * used, and leaving the excerpt behind in the parent would have left the hole
 * open on exactly the records that matched.
 */

interface ScanRecord {
    id: string;
    title: string;
    body: string;
}

interface ScanInput {
    source: string;
    flags: string;
    excerptLength: number;
    records: ScanRecord[];
}

/** Matches of `matcher` in `text`, counted without keeping them. */
function countMatches(matcher: RegExp, text: string): number {
    if (!text) return 0;
    matcher.lastIndex = 0;
    let count = 0;
    while (matcher.exec(text)) {
        count += 1;
        // A zero-width match does not advance `lastIndex` on its own, and the
        // loop would never end. `//` is not reachable — the query form
        // requires a non-empty pattern — but `/(?:)*/ ` and friends are.
        if (matcher.lastIndex === 0) break;
    }
    return count;
}

/** The line holding the first body match, trimmed to the excerpt length. */
function matchedLine(matcher: RegExp, body: string, length: number): string | null {
    if (!body) return null;
    matcher.lastIndex = 0;
    const match = matcher.exec(body);
    if (!match) return null;
    const start = body.lastIndexOf("\n", match.index) + 1;
    const end = body.indexOf("\n", match.index);
    const line = body
        .slice(start, end === -1 ? body.length : end)
        // A fixed pattern over one line, not the user's, so it is bounded.
        .replace(/\s+/g, " ")
        .trim();
    return line.length > length ? `${line.slice(0, length).trimEnd()}…` : line;
}

const input = workerData as ScanInput;
const matcher = new RegExp(input.source, input.flags);

parentPort?.postMessage(
    input.records.map((record) => {
        const titleMatches = countMatches(matcher, String(record.title || ""));
        const matchCount =
            countMatches(matcher, String(record.id || "")) +
            titleMatches +
            countMatches(matcher, record.body);
        return {
            titleMatches,
            matchCount,
            line: matchCount
                ? matchedLine(matcher, record.body, input.excerptLength)
                : null
        };
    })
);
