/**
 * What a query matches, for the demo backend — the server's rule, mirrored.
 *
 * `api.demo.ts` answered `q` with a case-insensitive `includes` over the raw
 * title, body, path and id. The server tokenizes: a body matches by whole token
 * and only a title falls back to a substring. So `nvoic` found a body on the
 * hosted demo and found nothing against a real workspace, and the free-text
 * control had to promise something that was exactly true of one of them and
 * merely understated for the other (T-0195, T-0202).
 *
 * The direction was the safe one — the demo matched more, so nothing silently
 * failed there — but the demo is what most readers see first, and a promise the
 * interface makes should be true of both things behind it.
 *
 * Mirrored here rather than imported because the server module is Node code that
 * reaches the filesystem, and the demo is a static bundle. `demo-parity.test.ts`
 * drives both over one fixture and fails when they disagree, which is the only
 * thing that keeps a mirror honest — the alternative was two implementations
 * asserted separately, which is how these two drifted in the first place.
 *
 * Loosening the server was the other option and it is the wrong one: the
 * whole-token body index is what keeps search fast over a real corpus, and that
 * is a measured decision recorded in `query.ts`.
 */

/**
 * Any record, read by field name.
 *
 * Deliberately not an interface with an index signature: `DocumentRecord`,
 * `ChangeRecord` and the rest declare none, so requiring one would have made
 * every call site cast — and a cast at the call site is a cast the reader has to
 * check, where this one is checked once.
 */
export type SearchableRecord = object;

function field(record: SearchableRecord, name: string): unknown {
    return (record as Record<string, unknown>)[name];
}

/**
 * The server's tokenizer, character class included.
 *
 * Locale-independent on purpose, for the reason the server states: an index
 * built under tr-TR and read under en-US produces tokens that do not match.
 */
export function tokenize(value: unknown): string[] {
    return String(value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/[^a-z0-9_-]+/)
        .filter(Boolean);
}

/** The fields the server folds into one `metadata` bag, in its order. */
const METADATA_FIELDS = [
    "path",
    "kind",
    "recordType",
    "status",
    "type",
    "area",
    "visibility",
    "version",
    "category",
    "severity",
    "confidence"
] as const;

/** And the list-valued ones it appends to the same bag. */
const METADATA_LISTS = ["tags", "owners", "deciders"] as const;

interface RecordTokens {
    id: Set<string>;
    /** Kept as an array too: the title falls back to a substring test. */
    title: string[];
    titleSet: Set<string>;
    metadata: Set<string>;
    body: Set<string>;
}

/**
 * Cached per record object, the way the server caches on the record itself.
 *
 * The demo runs this on every keystroke over the whole snapshot, and tokenizing
 * three hundred bodies per character is exactly the waste the server's own cache
 * exists to avoid. A `WeakMap` rather than a property so nothing reaches a
 * response body, and so a replaced record is collected with its tokens.
 */
const CACHE = new WeakMap<object, RecordTokens>();

function tokensOf(record: SearchableRecord): RecordTokens {
    const cached = CACHE.get(record);
    if (cached) return cached;
    const title = tokenize(field(record, "title"));
    const metadata = [
        ...METADATA_FIELDS.map((name) => field(record, name)),
        ...METADATA_LISTS.flatMap((name) => {
            const value = field(record, name);
            return Array.isArray(value) ? (value as unknown[]) : [];
        })
    ].join(" ");
    const tokens: RecordTokens = {
        id: new Set(tokenize(field(record, "id"))),
        title,
        titleSet: new Set(title),
        metadata: new Set(tokenize(metadata)),
        body: new Set(tokenize(field(record, "body")))
    };
    CACHE.set(record, tokens);
    return tokens;
}

/**
 * The server's weights, which are the ranking as well as the match: a record
 * matches a set of terms when it scores above zero for any of them.
 */
export function searchScore(record: SearchableRecord, terms: string[]): number {
    if (!terms.length) return 0;
    const tokens = tokensOf(record);
    let score = 0;
    for (const term of terms) {
        if (tokens.id.has(term)) score += 30;
        if (tokens.titleSet.has(term)) score += 15;
        else if (tokens.title.some((token) => token.includes(term))) score += 8;
        if (tokens.metadata.has(term)) score += 5;
        if (tokens.body.has(term)) score += 2;
    }
    return score;
}

/** The server's `QUERY_TOKEN`: `-`, an optional `field:`, and a quoted or bare value. */
const QUERY_TOKEN =
    /(-)?(?:([a-z_]+):(?:"([^"]*)"|(\S*))|"([^"]*)"|(\S+))/gi;

export interface ParsedQuery {
    terms: Array<{ value: string; negated: boolean }>;
    filters: Array<{ field: string; value: string; negated: boolean }>;
}

export function parseQuery(query: string): ParsedQuery {
    const terms: ParsedQuery["terms"] = [];
    const filters: ParsedQuery["filters"] = [];
    for (const match of String(query || "").matchAll(QUERY_TOKEN)) {
        const negated = match[1] === "-";
        const field = match[2]?.toLowerCase();
        const value = (match[3] ?? match[4] ?? match[5] ?? match[6] ?? "").trim();
        if (!value) continue;
        if (field) filters.push({ field, value: value.toLowerCase(), negated });
        else terms.push({ value, negated });
    }
    return { terms, filters };
}

function fieldValues(record: SearchableRecord, name: string): string[] {
    const value = field(record, name);
    if (value == null) return [];
    return (Array.isArray(value) ? value : [value]).map((entry) =>
        String(entry).toLowerCase()
    );
}

function matchesFilters(
    record: SearchableRecord,
    filters: ParsedQuery["filters"]
): boolean {
    return filters.every((filter) => {
        // `tag:` reads more naturally than `tags:`, and `claim:` than
        // `claimed_by:`; both spellings work, as on the server.
        const name =
            filter.field === "tag"
                ? "tags"
                : filter.field === "claim"
                  ? "claimed_by"
                  : filter.field;
        const hit = fieldValues(record, name).some((value) =>
            value.includes(filter.value)
        );
        return filter.negated ? !hit : hit;
    });
}

/**
 * Whether a record answers a query, and how strongly.
 *
 * `null` is "no", so a caller can filter and rank in one pass. An empty query
 * keeps every record at score zero, which is what both list endpoints do.
 */
export function scoreQuery(
    record: SearchableRecord,
    query: string
): number | null {
    const parsed = parseQuery(query);
    if (!matchesFilters(record, parsed.filters)) return null;
    const excluded = parsed.terms
        .filter((term) => term.negated)
        .flatMap((term) => tokenize(term.value));
    if (excluded.length && searchScore(record, excluded)) return null;
    const terms = tokenize(
        parsed.terms
            .filter((term) => !term.negated)
            .map((term) => term.value)
            .join(" ")
    );
    if (!terms.length) return 0;
    const score = searchScore(record, terms);
    return score > 0 ? score : null;
}

/** The predicate on its own, for the callers that only filter. */
export function matchesQuery(record: SearchableRecord, query: string): boolean {
    return scoreQuery(record, query) !== null;
}

/**
 * Filtered and ranked, which is the server's ordering too: score first, then the
 * most recently touched, then the title. Two records with nothing to separate
 * them must not swap between the demo and a real workspace.
 */
export function rankByQuery<T extends SearchableRecord>(
    records: readonly T[],
    query: string
): T[] {
    return records
        .map((record) => ({ record, score: scoreQuery(record, query) }))
        .filter(
            (entry): entry is { record: T; score: number } => entry.score !== null
        )
        .sort(
            (left, right) =>
                right.score - left.score ||
                String(
                    field(right.record, "updated") ||
                        field(right.record, "date") ||
                        ""
                ).localeCompare(
                    String(
                        field(left.record, "updated") ||
                            field(left.record, "date") ||
                            ""
                    )
                ) ||
                String(field(left.record, "title") || "").localeCompare(
                    String(field(right.record, "title") || "")
                )
        )
        .map((entry) => entry.record);
}
