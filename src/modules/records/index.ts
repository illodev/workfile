import { posix, resolve } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";

import { discoverFiles, normalizeRepoPath } from "../../core/glob.js";
import { mapWithConcurrency } from "../../core/concurrency.js";
import { loadCards } from "../cards/index.js";
import { diagnoseChangelog, loadChangelog } from "../changelog/index.js";
import { diagnoseDocuments, loadDocuments } from "../docs/index.js";
import { diagnoseMemory, loadMemory } from "../memory/index.js";
import { createCollectionRegistry } from "./registry.js";
import { readIndexCache, writeIndexCache } from "./cache.js";

const RECORD_ID_RE = /\b[A-Z][A-Z0-9]{0,11}-\d{4,}\b/g;
// `[[T-0042]]` and `[[T-0042|label]]`. A wiki-link is a declared reference,
// unlike an ID that merely appears in a sentence, so it is classified with the
// frontmatter edges rather than with prose mentions.
const WIKI_LINK_RE = /\[\[\s*([A-Z][A-Z0-9]{0,11}-\d{4,})\s*(?:\|[^\]]*)?\]\]/g;

// Read once at module load rather than threaded through every call. Part of the
// persisted cache key, so an upgraded package never reads records serialized by
// the version before it.
const INDEX_RUNTIME_VERSION = JSON.parse(
    await readFile(new URL("../../../../package.json", import.meta.url), "utf8")
).version;

function cardPath(workspace, card) {
    return `${
        card.archived
            ? workspace.config.cards.archivePath
            : workspace.config.cards.path
    }/${card.file}`.replaceAll("\\", "/");
}

export function recordFromCard(workspace, card) {
    return {
        ...card,
        kind: "card",
        recordType: card.type,
        path: cardPath(workspace, card)
    };
}

export function recordFromDocument(document) {
    return {
        ...document,
        kind: "doc",
        recordType: document.documentKind
    };
}

export function recordFromChange(fragment) {
    return { ...fragment, kind: "change", recordType: fragment.type };
}

export function recordFromRelease(release) {
    return { ...release, kind: "release", recordType: "release" };
}

export function recordFromMemory(record) {
    return { ...record, kind: "memory", recordType: record.collection };
}

export function recordReferences(record) {
    const explicit = [];
    if (record.kind === "card") {
        if (record.parent) explicit.push(record.parent);
        explicit.push(...(record.depends || []), ...(record.related || []));
    } else if (record.kind === "doc") {
        explicit.push(...(record.related || []), ...(record.supersedes || []));
    } else if (record.kind === "change") {
        explicit.push(
            ...(record.cards || []),
            ...(record.decisions || []),
            ...(record.related || [])
        );
    } else if (record.kind === "release") {
        explicit.push(...(record.fragments || []));
    } else if (record.kind === "memory") {
        explicit.push(
            ...(record.related || []),
            ...(record.supersedes || []),
            ...(record.superseded_by || []),
            ...(record.graduated_to || []),
            ...(record.corrective_actions || [])
        );
    } else {
        explicit.push(...(record.related || []));
    }
    const inline = String(record.body || "").match(RECORD_ID_RE) || [];
    return [...new Set([...explicit, ...inline])].filter(
        (reference) => reference && reference !== record.id
    );
}

/**
 * References split by how they were declared.
 *
 * An ID written in prose is not the same thing as one listed in `depends` or
 * `related`, but both used to arrive labelled `reference` and a consumer had no
 * way to tell them apart. On a real workspace that made ~43% of the graph's
 * edges prose, which is noise for anything trying to follow real dependencies.
 */
export function classifiedReferences(record) {
    const explicit = new Set(recordReferences({ ...record, body: "" }));
    for (const match of String(record.body || "").matchAll(WIKI_LINK_RE)) {
        if (match[1] !== record.id) explicit.add(match[1]);
    }
    const relations = new Map<string, string>();
    for (const id of explicit) relations.set(id, "reference");
    for (const id of recordReferences(record)) {
        if (!relations.has(id)) relations.set(id, "mention");
    }
    return relations;
}

function markdownDocumentPaths(record) {
    const links = [];
    const pattern = /\[[^\]]*\]\(([^)]+)\)/g;
    for (const match of String(record.body || "").matchAll(pattern)) {
        let target = match[1].trim().replace(/^<|>$/g, "");
        if (
            !target ||
            target.startsWith("#") ||
            /^[a-z][a-z0-9+.-]*:/i.test(target)
        ) {
            continue;
        }
        target = target.split(/[?#]/, 1)[0];
        try {
            target = decodeURIComponent(target);
        } catch {
            // Keep malformed percent escapes as a literal path.
        }
        const resolved = target.startsWith("/")
            ? target.slice(1)
            : posix.normalize(posix.join(posix.dirname(record.path), target));
        links.push(normalizeRepoPath(resolved));
    }
    return [...new Set(links)];
}

const DEFAULT_MAX_BACKLINKS = 20;

function decorateRelationships(records: any[], maxBacklinks = DEFAULT_MAX_BACKLINKS) {
    const byId = new Map<string, any>(
        records.map((record) => [record.id, record])
    );
    const byPath = new Map<string, any>(
        records.map((record) => [normalizeRepoPath(record.path), record])
    );
    const incoming = new Map<string, any[]>(
        records.map((record) => [record.id, []])
    );
    for (const record of records) {
        const targets = classifiedReferences(record);
        if (record.kind === "card" && record.source) {
            const sourcePath = normalizeRepoPath(
                String(record.source).split("#", 1)[0]
            );
            const sourceRecord = byPath.get(sourcePath);
            if (sourceRecord && sourceRecord.id !== record.id) {
                targets.set(sourceRecord.id, "source");
            }
        }
        for (const linkedPath of markdownDocumentPaths(record)) {
            const linkedRecord = byPath.get(linkedPath);
            if (linkedRecord && linkedRecord.id !== record.id) {
                if (!targets.has(linkedRecord.id)) {
                    targets.set(linkedRecord.id, "markdown");
                }
            }
        }
        record.outgoing = [...targets].map(([id, relation]) => ({
            id,
            relation,
            exists: byId.has(id),
            ...(byId.has(id)
                ? {
                      kind: byId.get(id).kind,
                      title: byId.get(id).title,
                      path: byId.get(id).path
                  }
                : {})
        }));
        for (const link of record.outgoing) {
            if (!incoming.has(link.id)) continue;
            // `path` is dropped: it is derivable from the id through the index,
            // and on a record everybody cites it was most of the payload.
            incoming.get(link.id).push({
                id: record.id,
                relation: link.relation,
                kind: record.kind,
                title: record.title
            });
        }
    }
    const RELATION_RANK = { source: 0, reference: 1, markdown: 2, mention: 3 };
    for (const record of records) {
        const all = incoming.get(record.id) || [];
        // Hub records are the ones everybody links to, so they are exactly the
        // ones whose backlink list was unusable: a card with 218 of them
        // serialized to ~58 KB, of which 93% was this array and 0.5% was the
        // card. The full list stays available through the index.
        record.incomingTotal = all.length;
        record.incoming =
            all.length <= maxBacklinks
                ? all
                : [...all]
                      .sort(
                          (left, right) =>
                              (RELATION_RANK[left.relation] ?? 9) -
                              (RELATION_RANK[right.relation] ?? 9)
                      )
                      .slice(0, maxBacklinks);
    }
    return byId;
}

export function createDefaultCollectionRegistry() {
    return createCollectionRegistry([
        {
            id: "cards",
            enabled: (workspace) => workspace.config.cards.enabled,
            async load(workspace) {
                const loaded = await loadCards(workspace);
                return {
                    records: loaded.cards.map((card) =>
                        recordFromCard(workspace, card)
                    ),
                    unreadable: loaded.unreadable,
                    raw: loaded,
                    counts: { cards: loaded.cards.length }
                };
            }
        },
        {
            id: "docs",
            enabled: (workspace) => workspace.config.docs.enabled,
            async load(workspace) {
                const loaded = await loadDocuments(workspace);
                return {
                    records: loaded.documents.map(recordFromDocument),
                    unreadable: loaded.unreadable,
                    raw: loaded,
                    counts: {
                        docs: loaded.documents.length,
                        managedDocs: loaded.documents.filter(
                            (document) => document.managed
                        ).length,
                        indexedDocs: loaded.documents.filter(
                            (document) => !document.managed
                        ).length
                    }
                };
            }
        },
        {
            id: "changelog",
            enabled: (workspace) => workspace.config.changelog.enabled,
            async load(workspace) {
                const loaded = await loadChangelog(workspace);
                return {
                    records: [
                        ...loaded.fragments.map(recordFromChange),
                        ...loaded.releases.map(recordFromRelease)
                    ],
                    unreadable: loaded.unreadable,
                    raw: loaded,
                    counts:
                        loaded.fragments.length || loaded.releases.length
                            ? {
                                  changes: loaded.fragments.length,
                                  unreleasedChanges: loaded.fragments.filter(
                                      (fragment) => !fragment.released
                                  ).length,
                                  releases: loaded.releases.length
                              }
                            : {}
                };
            }
        },
        {
            id: "memory",
            enabled: (workspace) => workspace.config.memory.enabled,
            async load(workspace) {
                const loaded = await loadMemory(workspace);
                return {
                    records: loaded.records.map(recordFromMemory),
                    unreadable: loaded.unreadable,
                    raw: loaded,
                    counts: loaded.records.length
                        ? {
                              memory: loaded.records.length,
                              ...Object.fromEntries(
                                  workspace.config.memory.collections.map(
                                      (collection) => [
                                          collection,
                                          loaded.records.filter(
                                              (record) =>
                                                  record.collection === collection
                                          ).length
                                      ]
                                  )
                              )
                          }
                        : {}
                };
            }
        }
    ]);
}

/**
 * Builds the index, reusing a persisted one when the corpus has not moved.
 *
 * The CLI starts a process per command, so without this every invocation pays
 * for the whole corpus: ~130 ms of Node startup against ~830 ms for
 * `workfile search` on a mid-sized workspace. Diagnosed builds are never cached,
 * because their reports depend on the filesystem beyond the records themselves.
 */
export async function buildProjectIndex(workspace, options: any = {}) {
    const cacheable =
        options.cache !== false &&
        options.diagnose !== true &&
        !options.registry &&
        !options.now;
    let fingerprint = null;
    if (cacheable) {
        fingerprint = await workspaceFingerprint(workspace);
        const cached = await readIndexCache(workspace, {
            fingerprint,
            packageVersion: options.packageVersion || INDEX_RUNTIME_VERSION
        });
        if (cached) {
            // Without this the first query after a cache hit re-tokenizes the
            // whole corpus — 224 ms on a mid-sized workspace, which is most of
            // what a single `workfile search` costs.
            restorePostings(cached.records, cached.postings);
            delete cached.postings;
            return cached;
        }
    }
    const index = await buildProjectIndexUncached(workspace, options);
    if (cacheable) {
        await writeIndexCache(
            workspace,
            { ...index, postings: serializePostings(index.records) },
            {
                fingerprint,
                packageVersion: options.packageVersion || INDEX_RUNTIME_VERSION
            }
        );
    }
    return index;
}

async function buildProjectIndexUncached(workspace, options: any = {}) {
    const registry = options.registry || createDefaultCollectionRegistry();
    const collections = await registry.load(workspace);
    const records = collections.flatMap(({ result }) => result.records || []);
    const byId = decorateRelationships(
        records,
        options.maxBacklinks ?? DEFAULT_MAX_BACKLINKS
    );
    const duplicateIds = new Map();
    for (const record of records) {
        if (!duplicateIds.has(record.id)) duplicateIds.set(record.id, []);
        duplicateIds.get(record.id).push(record.path);
    }

    const now = options.now || new Date();
    const docsCollection = collections.find(
        ({ collection }) => collection.id === "docs"
    );
    const changelogCollection = collections.find(
        ({ collection }) => collection.id === "changelog"
    );
    const memoryCollection = collections.find(
        ({ collection }) => collection.id === "memory"
    );
    const loadedDocs = docsCollection?.result.raw || {
        documents: [],
        unreadable: []
    };
    const loadedChangelog = changelogCollection?.result.raw || {
        fragments: [],
        releases: [],
        unreadable: []
    };
    const loadedMemory = memoryCollection?.result.raw || {
        records: [],
        unreadable: []
    };
    // Diagnosis is off the hot path. It walks every local link with an
    // `access()` per path, and every listing, search and record read used to
    // pay for it — `doctor` and `/api/v2/health` are the only callers that
    // actually want it.
    const diagnose = options.diagnose === true;
    // `diagnosed: false` on each report so a consumer reading an empty issue
    // list can tell "nothing wrong" from "nothing checked".
    const empty = {
        ok: true,
        diagnosed: false,
        counts: { error: 0, warning: 0, info: 0 },
        issues: []
    };
    const documentReport = diagnose
        ? await diagnoseDocuments({
              ...loadedDocs,
              workspace,
              knownRecords: byId,
              now
          })
        : { ...empty, module: "docs" };
    const changelogReport = diagnose
        ? diagnoseChangelog({
              ...loadedChangelog,
              workspace,
              knownRecords: byId,
              now
          })
        : { ...empty, module: "changelog" };
    const memoryReport = diagnose
        ? diagnoseMemory({
              ...loadedMemory,
              workspace,
              knownRecords: byId,
              now
          })
        : { ...empty, module: "memory" };
    const reports = {
        docs: documentReport,
        changelog: changelogReport,
        memory: memoryReport
    };
    const issuesByRecord = new Map();
    for (const report of Object.values(reports)) {
        for (const issue of report.issues) {
            if (!issue.id) continue;
            if (!issuesByRecord.has(issue.id)) issuesByRecord.set(issue.id, []);
            issuesByRecord.get(issue.id).push(issue);
        }
    }
    for (const record of records) {
        record.issues = issuesByRecord.get(record.id) || [];
        if (record.kind === "doc") {
            record.freshness = record.issues.filter((issue) =>
                [
                    "doc-source-newer",
                    "doc-review-overdue",
                    "doc-related-card-newer"
                ].includes(issue.code)
            );
        }
        if (record.kind === "memory") {
            record.lifecycleIssues = record.issues.filter((issue) =>
                [
                    "context-expired-active",
                    "context-review-overdue",
                    "context-lifecycle-missing",
                    "learning-graduation-target-missing",
                    "memory-supersession-target-missing"
                ].includes(issue.code)
            );
        }
    }
    return {
        generatedAt: new Date().toISOString(),
        // Postings are built after the final sort, because they index by
        // position: building them earlier would point at the wrong records.
        records: attachPostings(
            records.sort((left, right) =>
                left.id.localeCompare(right.id, undefined, { numeric: true })
            ),
            buildPostings(
                records.sort((left, right) =>
                    left.id.localeCompare(right.id, undefined, { numeric: true })
                )
            )
        ),
        byId,
        modules: Object.assign(
            {},
            ...collections.map(({ result }) => result.counts || {})
        ),
        unreadable: Object.fromEntries(
            collections.map(({ collection, result }) => [
                collection.id,
                result.unreadable || []
            ])
        ),
        reports,
        collections: collections.map(({ collection }) => collection.id),
        // Tells a cache whether the reports above were actually produced, so an
        // undiagnosed index is never served to a caller that asked for one.
        diagnosed: diagnose,
        duplicates: [...duplicateIds]
            .filter(([, paths]) => paths.length > 1)
            .map(([id, paths]) => ({ id, paths }))
    };
}

function tokenize(value) {
    return (
        String(value || "")
            // Locale-independent on purpose: `toLocaleLowerCase` follows the
            // host's locale, so an index built under tr-TR and read under en-US
            // produces tokens that do not match \u2014 silently, and permanently
            // once these tokens are cached.
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .split(/[^a-z0-9_-]+/)
            .filter(Boolean)
    );
}

/**
 * Tokens per record, computed once and hung off the record.
 *
 * `searchScore` tokenized id, title, metadata and the entire Markdown body on
 * every call \u2014 for every record, for every query, including queries with no
 * terms at all, where the loop below never ran and the work was pure waste.
 * The property is non-enumerable so it never reaches a response body.
 */
const TOKENS = Symbol("projectRecordTokens");

function tokensOf(record) {
    const cached = record[TOKENS];
    if (cached) return cached;
    const tokens = {
        id: new Set(tokenize(record.id)),
        // Title keeps its array: scoring falls back to a substring test, which
        // a Set cannot answer.
        title: tokenize(record.title),
        titleSet: new Set<string>(),
        metadata: new Set(
            tokenize(
                [
                    record.path,
                    record.kind,
                    record.recordType,
                    record.status,
                    record.type,
                    record.area,
                    record.visibility,
                    record.version,
                    record.category,
                    record.severity,
                    record.confidence,
                    ...(record.tags || []),
                    ...(record.owners || []),
                    ...(record.deciders || [])
                ].join(" ")
            )
        ),
        body: new Set(tokenize(record.body))
    };
    tokens.titleSet = new Set(tokens.title);
    Object.defineProperty(record, TOKENS, {
        value: tokens,
        enumerable: false,
        configurable: true
    });
    return tokens;
}

/**
 * term → indices into the record array it was built for.
 *
 * Attached to the array rather than the index so it survives being passed to
 * `searchProjectRecords(index.records, …)`, and so a *filtered* array simply
 * has no postings and falls back to a full scan — which is correct, because
 * these indices only mean anything for the exact array they were built from.
 */
const POSTINGS = Symbol("projectRecordPostings");

/** The postings as plain data, for the persisted cache. */
export function serializePostings(records) {
    const postings: Map<string, number[]> = records[POSTINGS];
    if (!postings) return null;
    return Object.fromEntries(postings);
}

export function restorePostings(records, serialized) {
    if (!serialized) return records;
    return attachPostings(records, new Map(Object.entries(serialized)));
}

export function buildPostings(records) {
    const postings = new Map<string, number[]>();
    records.forEach((record, index) => {
        const tokens = tokensOf(record);
        for (const set of [tokens.id, tokens.titleSet, tokens.metadata, tokens.body]) {
            for (const term of set) {
                const list = postings.get(term);
                if (list) {
                    if (list[list.length - 1] !== index) list.push(index);
                } else {
                    postings.set(term, [index]);
                }
            }
        }
    });
    return postings;
}

function attachPostings(records, postings) {
    Object.defineProperty(records, POSTINGS, {
        value: postings,
        enumerable: false,
        configurable: true
    });
    return records;
}

/**
 * Records that could possibly score above zero for these terms.
 *
 * Scoring is left completely alone: this only decides *which* records reach it,
 * and a record outside the candidate set would have scored zero and been
 * discarded anyway. Ranking is therefore identical, which matters because the
 * ordering is what agents act on.
 *
 * The one subtlety is the title's substring fallback — `includes`, not a token
 * match — which no token index can answer. Titles are short, so they are
 * scanned directly.
 */
function candidateIndices(records, terms) {
    const postings: Map<string, number[]> = records[POSTINGS];
    if (!postings) return null;
    const candidates = new Set<number>();
    for (const term of terms) {
        for (const index of postings.get(term) || []) candidates.add(index);
    }
    for (const term of terms) {
        records.forEach((record, index) => {
            if (candidates.has(index)) return;
            if (String(record.title || "").toLowerCase().includes(term)) {
                candidates.add(index);
            }
        });
    }
    return candidates;
}

/**
 * The query grammar, shared by every surface.
 *
 * The interface had a real one — `field:value`, `-negation`, `"quoted phrase"` —
 * and the core had none, so `status:doing` filtered correctly in the Explorer
 * and scored as two loose words everywhere else. Same string, different
 * answers, depending on which view you happened to be in.
 *
 * Field names are the record's own keys, so the vocabulary follows the runtime
 * schema instead of being a second list to keep in step.
 */
const QUERY_TOKEN =
    /(-?)(?:([a-z_]+):(?:"([^"]+)"|(\S+))|"([^"]+)"|(\S+))/gi;

export function parseQuery(query) {
    const terms = [];
    const filters = [];
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

function fieldValues(record, field) {
    const value = record[field];
    if (value == null) return [];
    return (Array.isArray(value) ? value : [value]).map((entry) =>
        String(entry).toLowerCase()
    );
}

function matchesFilters(record, filters) {
    return filters.every((filter) => {
        // `tag:` reads more naturally than `tags:`, and `claim:` than
        // `claimed_by:`; both spellings work.
        const field =
            filter.field === "tag"
                ? "tags"
                : filter.field === "claim"
                  ? "claimed_by"
                  : filter.field;
        const hit = fieldValues(record, field).some((value) =>
            value.includes(filter.value)
        );
        return filter.negated ? !hit : hit;
    });
}

function searchScore(record, terms) {
    // No terms means no scoring, and the caller keeps every record anyway.
    // Reaching the tokenizer here cost a full pass over every body in the
    // workspace for `doc list` and `memory list`, which pass an empty query.
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

/**
 * Fields every projected record keeps, whatever the view.
 *
 * Enough to render a row, open the record and reason about it — and nothing
 * whose size grows with the document.
 */
const SUMMARY_FIELDS = Object.freeze([
    "id",
    "kind",
    "recordType",
    "title",
    "path",
    "file",
    "status",
    "type",
    "priority",
    "area",
    "parent",
    "milestone",
    "tags",
    "managed",
    "documentKind",
    "visibility",
    "collection",
    "version",
    "claimed_by",
    "claimed_at",
    "created",
    "updated",
    "revision",
    "searchScore",
    "incomingTotal"
]);

const EXCERPT_LENGTH = 200;

function excerptOf(body) {
    const text = String(body || "")
        .replace(/\s+/g, " ")
        .trim();
    return text.length > EXCERPT_LENGTH
        ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…`
        : text;
}

/**
 * Narrows a record to what a caller asked for.
 *
 * `full` is the historical shape and stays the default, because dropping fields
 * from it is a breaking change for anything already reading them. Listings ask
 * for `summary`, where the Markdown body — 64% of a serialized index — is
 * replaced by `bodyBytes` and a short `excerpt`, so a caller can decide what to
 * open without being handed everything.
 */
export function projectRecord(record, view = "full", fields = null) {
    if (fields?.length) {
        return Object.fromEntries(
            fields
                .filter((key) => key in record)
                .map((key) => [key, record[key]])
        );
    }
    if (view === "full") return record;
    const projected: Record<string, any> = {};
    for (const key of SUMMARY_FIELDS) {
        if (record[key] !== undefined) projected[key] = record[key];
    }
    if (view === "list") {
        // A listing is for choosing, not for writing. `revision` was a third of
        // the row and invites a write against a value that may already be
        // stale — the read-then-write that `get_record` exists for is both
        // cheaper and correct. `file` is derivable from `path`.
        delete projected.revision;
        delete projected.file;
    }
    projected.bodyBytes = Buffer.byteLength(String(record.body || ""), "utf8");
    if (view !== "list") projected.excerpt = excerptOf(record.body);
    if (view === "summary") {
        projected.outgoing = (record.outgoing || []).map(
            ({ id, relation, exists }) => ({ id, relation, exists })
        );
        projected.incoming = (record.incoming || []).map(
            ({ id, relation }) => ({ id, relation })
        );
    }
    return projected;
}

export function searchProjectRecords(
    records,
    query,
    { kinds = [], limit = 100, offset = 0, view = "full", fields = null }: any = {}
) {
    const parsed = parseQuery(query);
    // Negated words exclude; the rest are scored as before, so ranking for a
    // plain query is unchanged.
    const excluded = parsed.terms
        .filter((term) => term.negated)
        .flatMap((term) => tokenize(term.value));
    const terms = tokenize(
        parsed.terms
            .filter((term) => !term.negated)
            .map((term) => term.value)
            .join(" ")
    );
    const kindSet = new Set(Array.isArray(kinds) ? kinds : [kinds]);
    // With terms, only candidates are scored — which is what stops a query from
    // tokenizing every body in the workspace. Without terms every record is
    // kept anyway, so the postings have nothing to narrow.
    const candidates = terms.length ? candidateIndices(records, terms) : null;
    const considered = candidates
        ? [...candidates].sort((left, right) => left - right).map((index) => records[index])
        : records;
    const matches = considered
        .filter((record) => !kindSet.size || kindSet.has(record.kind))
        .filter((record) => matchesFilters(record, parsed.filters))
        .filter(
            (record) =>
                !excluded.length || !searchScore(record, excluded)
        )
        .map((record) => ({ record, score: searchScore(record, terms) }))
        .filter(({ score }) => !terms.length || score > 0)
        .sort(
            (left, right) =>
                right.score - left.score ||
                String(right.record.updated || right.record.date || "").localeCompare(
                    String(left.record.updated || left.record.date || "")
                ) ||
                left.record.title.localeCompare(right.record.title)
        );
    return {
        records: matches
            .slice(offset, offset + limit)
            .map(({ record, score }) =>
                projectRecord({ ...record, searchScore: score }, view, fields)
            ),
        total: matches.length,
        offset,
        limit,
        view
    };
}

export function findProjectRecord(index, id) {
    return index.records.find((record) => record.id === id) || null;
}

/**
 * A cheap signature of everything the index is built from.
 *
 * Discovering and stat-ing the corpus costs ~79 ms where rebuilding it costs
 * ~419 ms, so comparing signatures is the difference between an index that is
 * always fresh and one that is only fresh once a second.
 *
 * `(path, mtimeMs, size)` can in principle miss an edit that preserves both
 * within the filesystem's mtime granularity. That is why this is a fast path
 * and not the source of truth: writes through the protocol invalidate the store
 * directly, and the signature exists to catch everything else — git, an editor,
 * another process.
 */
export async function workspaceFingerprint(workspace) {
    const protocolRoot = normalizeRepoPath(workspace.config.storage.root);
    const cacheRoot = normalizeRepoPath(workspace.config.storage.cache);
    const include = [
        `${protocolRoot}/**/*.md`,
        `${protocolRoot}/VERSION`,
        ...(workspace.config.docs.enabled
            ? workspace.config.docs.sources || []
            : [])
    ];
    const files = await discoverFiles(workspace.root, {
        include,
        exclude: [`${cacheRoot}/**`, ...(workspace.config.docs.exclude || [])]
    });
    const stats = await mapWithConcurrency(files.sort(), async (file) => {
        try {
            const info = await stat(resolve(workspace.root, file));
            return `${file}:${info.mtimeMs}:${info.size}`;
        } catch {
            return `${file}:gone`;
        }
    });
    const hash = createHash("sha256");
    hash.update(String(files.length));
    for (const entry of stats) {
        hash.update("\n");
        hash.update(entry);
    }
    return hash.digest("hex");
}

export function createProjectIndexStore(
    workspace,
    {
        maxAgeMs = 0,
        // How long a signature check is trusted before being taken again. Keeps
        // a burst of requests inside one turn from re-stat-ing the corpus for
        // each of them, while keeping the observable staleness imperceptible.
        revalidateAfterMs = 250,
        now = () => Date.now()
    }: any = {}
) {
    let cached: any = null;
    let cachedFingerprint: string | null = null;
    let loadedAt = 0;
    let checkedAt = 0;
    let inflight = null;
    // Bumped on every invalidation. A build that started before the workspace
    // changed must not become the cached answer afterwards — which is what used
    // to happen, leaving the pre-write state cached for up to a full TTL.
    let epoch = 0;

    async function stillCurrent(current) {
        if (current - checkedAt < revalidateAfterMs) return true;
        const fingerprint = await workspaceFingerprint(workspace);
        checkedAt = now();
        if (fingerprint === cachedFingerprint) return true;
        cachedFingerprint = fingerprint;
        return false;
    }

    return {
        get epoch() {
            return epoch;
        },
        async get({ fresh = false, diagnose = false }: any = {}) {
            const current = now();
            // A diagnosed index satisfies an undiagnosed request, never the
            // reverse: the reports would be empty and callers would read that
            // as a clean bill of health.
            const usable = cached && (!diagnose || cached.diagnosed);
            const withinCeiling = !maxAgeMs || current - loadedAt <= maxAgeMs;
            if (!fresh && usable && withinCeiling && (await stillCurrent(current))) {
                return cached;
            }
            if (!fresh && inflight && !diagnose) return inflight;
            const startedAt = epoch;
            inflight = Promise.all([
                buildProjectIndex(workspace, { diagnose }),
                // Taken alongside the build so a write that lands mid-build is
                // seen as a change on the next request rather than baked in.
                workspaceFingerprint(workspace)
            ])
                .then(([index, fingerprint]) => {
                    if (epoch === startedAt) {
                        cached = index;
                        cachedFingerprint = fingerprint;
                        loadedAt = now();
                        checkedAt = loadedAt;
                    }
                    return index;
                })
                .finally(() => {
                    inflight = null;
                });
            return inflight;
        },
        invalidate() {
            cached = null;
            cachedFingerprint = null;
            loadedAt = 0;
            checkedAt = 0;
            epoch += 1;
        }
    };
}
