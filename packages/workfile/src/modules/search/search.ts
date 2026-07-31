import { ValidationError } from "../../core/errors.js";
import { projectRecord, searchProjectRecords } from "../records/public.js";
import type {
    HybridSearchOptions,
    ProjectRecord,
    ProjectSearchResult,
    SemanticSearchProvider
} from "../../types.js";

function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

/**
 * The full `/pattern/flags` form: both delimiters present, a non-empty
 * pattern, flags a subset of `imsu`. Anything else — a slash inside a plain
 * query, a missing closing delimiter, an unknown flag — is not a regex query
 * and falls through to the lexical/hybrid path.
 */
const REGEX_QUERY = /^\/(.+)\/([imsu]*)$/s;
const REGEX_PATTERN_MAX = 256;
const REGEX_BODY_CAP = 20_000;
const REGEX_EXCERPT_LENGTH = 200;

function parseRegexQuery(query) {
    const match = REGEX_QUERY.exec(String(query || "").trim());
    if (!match) return null;
    return { pattern: match[1], flags: match[2] };
}

function compileRegexQuery({ pattern, flags }) {
    if (pattern.length > REGEX_PATTERN_MAX) {
        throw new ValidationError(
            "SEARCH_REGEX_INVALID",
            `Regular expression patterns are capped at ${REGEX_PATTERN_MAX} characters.`
        );
    }
    try {
        // `g` so matches can be counted; user flags stay a subset of `imsu`.
        return new RegExp(pattern, `${flags}g`);
    } catch (error) {
        throw new ValidationError(
            "SEARCH_REGEX_INVALID",
            error instanceof Error ? error.message : String(error)
        );
    }
}

function countMatches(matcher, text) {
    if (!text) return 0;
    matcher.lastIndex = 0;
    return [...text.matchAll(matcher)].length;
}

/** The line containing the first body match, trimmed to excerpt length. */
function matchedLine(matcher, body) {
    if (!body) return null;
    matcher.lastIndex = 0;
    const match = matcher.exec(body);
    if (!match) return null;
    const start = body.lastIndexOf("\n", match.index) + 1;
    const end = body.indexOf("\n", match.index);
    const line = body
        .slice(start, end === -1 ? body.length : end)
        .replace(/\s+/g, " ")
        .trim();
    return line.length > REGEX_EXCERPT_LENGTH
        ? `${line.slice(0, REGEX_EXCERPT_LENGTH).trimEnd()}…`
        : line;
}

function searchRecordsByRegex(
    candidates: ProjectRecord[],
    matcher: RegExp,
    { limit, offset, view, fields }
): ProjectSearchResult {
    const ranked = candidates
        .map((record) => {
            const body = String(record.body || "").slice(0, REGEX_BODY_CAP);
            const titleMatches = countMatches(matcher, String(record.title || ""));
            const matchCount =
                countMatches(matcher, String(record.id || "")) +
                titleMatches +
                countMatches(matcher, body);
            return { record, body, titleMatches, matchCount };
        })
        .filter(({ matchCount }) => matchCount > 0)
        .sort(
            (left, right) =>
                Number(right.titleMatches > 0) - Number(left.titleMatches > 0) ||
                right.matchCount - left.matchCount ||
                String(right.record.updated || right.record.date || "").localeCompare(
                    String(left.record.updated || left.record.date || "")
                ) ||
                left.record.title.localeCompare(right.record.title)
        );
    return {
        records: ranked
            .slice(offset, offset + limit)
            .map(({ record, body, matchCount }) => {
                const projected = projectRecord(
                    { ...record, searchScore: matchCount },
                    view,
                    fields
                );
                // Where the projection carries an excerpt, show the matched
                // line instead of the head of the body.
                if (projected.excerpt !== undefined) {
                    const line = matchedLine(matcher, body);
                    if (line) projected.excerpt = line;
                }
                return projected;
            }),
        total: ranked.length,
        offset,
        limit,
        view,
        mode: "regex",
        provider: null
    };
}

function normalizeKinds(kinds) {
    if (!kinds) return [];
    return Array.isArray(kinds) ? kinds.filter(Boolean) : [kinds].filter(Boolean);
}

function normalizeProviderScores(result): Map<string, number> {
    if (result instanceof Map) return result;
    if (!Array.isArray(result)) {
        throw new ValidationError(
            "SEARCH_PROVIDER_RESULT_INVALID",
            "A semantic search provider must return a Map or an array of { id, score } entries."
        );
    }
    const scores = new Map<string, number>();
    for (const entry of result) {
        if (!entry || typeof entry.id !== "string") continue;
        scores.set(entry.id, clamp(entry.score));
    }
    return scores;
}

export function createSemanticSearchProvider(
    { id, search }: SemanticSearchProvider
): Readonly<SemanticSearchProvider> {
    if (!id || typeof id !== "string") {
        throw new ValidationError(
            "SEARCH_PROVIDER_ID_REQUIRED",
            "Semantic search providers require a non-empty id."
        );
    }
    if (typeof search !== "function") {
        throw new ValidationError(
            "SEARCH_PROVIDER_FUNCTION_REQUIRED",
            "Semantic search providers require a search function."
        );
    }
    return Object.freeze({ id, search });
}

/**
 * Combines the built-in deterministic lexical ranker with an optional semantic
 * provider. The provider is deliberately injected by the host: Workfile
 * never sends repository content to a network service by itself.
 */
export async function searchProjectRecordsHybrid(
    records: ProjectRecord[],
    query: string,
    {
        provider = null,
        kinds = [],
        limit = 100,
        offset = 0,
        semanticWeight = 0.35,
        maxProviderRecords = 500,
        view = "full",
        fields = null
    }: HybridSearchOptions = {}
): Promise<ProjectSearchResult> {
    const normalizedKinds = normalizeKinds(kinds);
    const kindSet = new Set<string>(normalizedKinds);
    const candidates = records.filter(
        (record) => !kindSet.size || kindSet.has(record.kind)
    );
    // `/pattern/flags` is exact-intent: it bypasses the semantic provider on
    // purpose and scans each record's id, title and body directly.
    const regexQuery = parseRegexQuery(query);
    if (regexQuery) {
        return searchRecordsByRegex(candidates, compileRegexQuery(regexQuery), {
            limit,
            offset,
            view,
            fields
        });
    }
    if (!provider || !String(query || "").trim()) {
        return {
            ...searchProjectRecords(candidates, query, {
                limit,
                offset,
                view,
                fields
            }),
            mode: "lexical",
            provider: null
        };
    }
    if (typeof provider.search !== "function") {
        throw new ValidationError(
            "SEARCH_PROVIDER_INVALID",
            "The semantic search provider does not expose search()."
        );
    }

    const lexical = searchProjectRecords(candidates, query, {
        limit: candidates.length || 1,
        offset: 0
    });
    const lexicalScores = new Map<string, number>(
        lexical.records.map((record) => [record.id, Number(record.searchScore) || 0])
    );
    const maximumLexical = Math.max(0, ...lexicalScores.values());
    // The cap selects by RELEVANCE, not index order. A plain slice(0, N) sent
    // the provider the first N records of the corpus regardless of the query —
    // on a ~3,800-record workspace with the default cap, 87% of the corpus was
    // silently invisible to the semantic layer, which defeats the one query it
    // exists for. Lexical hits go first (the ranking is already computed);
    // whatever cap room remains is filled with the rest in index order, so a
    // cap at corpus size still means "everything".
    const providerCap = Math.max(
        1,
        Math.min(5000, Number(maxProviderRecords) || 500)
    );
    let providerCandidates = candidates;
    if (candidates.length > providerCap) {
        const byId = new Map(candidates.map((record) => [record.id, record]));
        const picked: ProjectRecord[] = [];
        const seen = new Set<string>();
        for (const ranked of lexical.records) {
            if (picked.length >= providerCap) break;
            const record = byId.get(ranked.id);
            if (record) {
                picked.push(record);
                seen.add(ranked.id);
            }
        }
        for (const record of candidates) {
            if (picked.length >= providerCap) break;
            if (!seen.has(record.id)) picked.push(record);
        }
        providerCandidates = picked;
    }
    const providerResult = await provider.search({
        query: String(query),
        limit: Math.min(limit, providerCap),
        records: providerCandidates.map((record) => ({
            id: record.id,
            kind: record.kind,
            recordType: record.recordType,
            title: record.title,
            path: record.path,
            status: record.status,
            area: record.area,
            tags: record.tags || [],
            body: record.body || ""
        }))
    });
    const semanticScores = normalizeProviderScores(providerResult);
    const weight = clamp(semanticWeight);
    const ranked = candidates
        .map((record) => {
            const lexicalRaw = lexicalScores.get(record.id) || 0;
            const lexicalScore = maximumLexical
                ? lexicalRaw / maximumLexical
                : 0;
            const semanticScore = clamp(semanticScores.get(record.id) || 0);
            const combinedScore =
                lexicalScore * (1 - weight) + semanticScore * weight;
            return { record, lexicalRaw, lexicalScore, semanticScore, combinedScore };
        })
        .filter(({ combinedScore }) => combinedScore > 0)
        .sort(
            (left, right) =>
                right.combinedScore - left.combinedScore ||
                right.semanticScore - left.semanticScore ||
                right.lexicalRaw - left.lexicalRaw ||
                String(right.record.updated || right.record.date || "").localeCompare(
                    String(left.record.updated || left.record.date || "")
                ) ||
                left.record.title.localeCompare(right.record.title)
        );
    return {
        records: ranked
            .slice(offset, offset + limit)
            .map(({ record, lexicalRaw, semanticScore, combinedScore }) =>
                projectRecord(
                    {
                        ...record,
                        searchScore: Math.round(combinedScore * 10_000) / 100,
                        lexicalScore: lexicalRaw,
                        semanticScore
                    },
                    view,
                    fields
                )
            ),
        total: ranked.length,
        offset,
        limit,
        mode: "hybrid",
        provider: provider.id || "custom"
    };
}
