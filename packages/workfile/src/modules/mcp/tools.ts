import {
    NEXT_DEFAULT_LIMIT,
    NEXT_MAXIMUM_LIMIT,
    appendCardNote,
    archiveCard,
    claimCard,
    createCard,
    patchCard,
    patchCardBody,
    rankNextCards,
    releaseCard,
    reopenCard,
    transitionCard
} from "../cards/index.js";
import {
    createChangeFragment,
    createRelease,
    patchChangeFragment,
    previewRelease
} from "../changelog/index.js";
import {
    createManagedDocument,
    moveManagedDocument,
    patchManagedDocument
} from "../docs/index.js";
import { resolveActor } from "../../core/actor.js";
import {
    CARD_EFFORTS,
    CARD_PRIORITIES,
    CARD_STATUSES,
    CARD_TYPES
} from "../../config/defaults.js";
import { dateBoundary } from "../../core/inputs.js";
import { runDoctor } from "../health/doctor.js";
import {
    createMemoryRecord,
    graduateLearning,
    patchMemoryRecord,
    supersedeMemoryRecord
} from "../memory/index.js";
import {
    findProjectRecord,
    projectRecord,
    recordFromCard,
    recordFromChange,
    recordFromDocument,
    recordFromMemory,
    recordFromRelease
} from "../records/public.js";
import { searchProjectRecordsHybrid } from "../search/index.js";
import { buildAgentContext } from "../agents/index.js";
import { ConflictError, NotFoundError } from "../../core/errors.js";
import {
    boundedInteger,
    optionalString,
    plainObject,
    requiredString,
    stringList
} from "./values.js";

const OBJECT = { type: "object", additionalProperties: false };

/**
 * Property builders.
 *
 * Every property carries a `description` because the alternative is the model
 * inferring one from the property name, and names like `scope`, `source` and
 * `related` do not survive that inference — `scope` is filesystem paths on a
 * card and subject-matter tags on a document. Describing them is not
 * decoration; it is the difference between a call that lands and a retry.
 */
function text(description, extra: any = {}) {
    return { type: "string", description, ...extra };
}

/** A required identifier: never empty, never padded. */
function identifier(description) {
    return { type: "string", minLength: 1, description };
}

function strings(description, extra: any = {}) {
    return { type: "array", items: { type: "string" }, description, ...extra };
}

function flag(description, extra: any = {}) {
    return { type: "boolean", description, ...extra };
}

function count(description, extra: any = {}) {
    return { type: "integer", description, ...extra };
}

/**
 * A closed vocabulary.
 *
 * Only for the frozen protocol constants. Areas, document kinds, changelog
 * types and the rest are declared per project — `validateStringList` accepts
 * any string for them — so an enum here would refuse values a project has
 * legitimately configured. Those say where to look instead.
 */
function choice(values, description, extra: any = {}) {
    return { type: "string", enum: [...values], description, ...extra };
}

const WORKSPACE_VOCABULARY =
    "Project-declared, so the accepted values vary; project_workspace reports them.";

/** Project-declared classification axes: `{ context: "treasury" }`. */
const AXES_OBJECT = {
    type: "object",
    additionalProperties: { type: "string" },
    description:
        "Declared classification axes as { axis: value }, e.g. { context: \"treasury\" }. " +
        WORKSPACE_VOCABULARY
};

const EXPECTED_REVISION = text(
    "Revision string from an earlier read of this record. The write is refused if it no longer matches, so a concurrent edit is reported rather than overwritten. Omit to skip the check."
);

const ACTOR = text(
    "Who to attribute this to. Defaults to the MCP client's own name; pass one only to act on another actor's behalf."
);

const BODY = text("Markdown body, written below the frontmatter.");

const LIMIT_DEFAULT = 50;

function schema(properties, required: string[] = []) {
    return {
        ...OBJECT,
        properties,
        ...(required.length ? { required } : {})
    };
}

/**
 * A declared reply shape.
 *
 * Never a closed object: `toolResult` appends `truncated` when a payload
 * exceeds `mcp.maxToolResultBytes`, and a closed schema would make its own
 * degradation path invalid.
 */
function output(properties, required: string[] = []) {
    return {
        type: "object",
        additionalProperties: true,
        properties,
        ...(required.length ? { required } : {})
    };
}

const RECORD_SUMMARY = {
    type: "object",
    additionalProperties: true,
    description:
        "A record in list projection: identity and frontmatter without the Markdown body.",
    properties: {
        id: text("Stable record ID: T-0042, DOC-0003, CHG-0101, ADR-0009."),
        kind: text("Record family: card, doc, change, release or memory."),
        recordType: text(
            "Type within the family — a card's type, a document's kind, a memory record's collection."
        ),
        title: text("Human-readable title."),
        path: text("Repository-relative path to the Markdown file."),
        status: text("Lifecycle status, in the vocabulary of this record's family."),
        created: text("Creation date, YYYY-MM-DD."),
        updated: text("Date of the last write, YYYY-MM-DD."),
        incomingTotal: count("How many other records link to this one."),
        bodyBytes: count("Size in bytes of the body this projection left out.")
    }
};

const RECORD_FULL = {
    type: "object",
    additionalProperties: true,
    description: "A canonical record with its body, revision and reference graph.",
    properties: {
        id: text("Stable record ID."),
        kind: text("Record family: card, doc, change, release or memory."),
        recordType: text("Type within the family."),
        title: text("Human-readable title."),
        status: text("Lifecycle status."),
        path: text("Repository-relative path to the Markdown file."),
        file: text("File name within the collection directory."),
        revision: text("Content hash to pass back as expectedRevision on the next write."),
        body: text("Markdown body below the frontmatter."),
        created: text("Creation date, YYYY-MM-DD."),
        updated: text("Date of the last write, YYYY-MM-DD."),
        archived: flag("Whether the record lives in the archive directory."),
        tags: strings("Free-form tags."),
        outgoing: {
            type: "array",
            items: { type: "object", additionalProperties: true },
            description: "References this record makes to others."
        },
        incoming: {
            type: "array",
            items: { type: "object", additionalProperties: true },
            description: "Backlinks: references other records make to this one."
        },
        incomingTotal: count("Total backlinks, which may exceed the returned page."),
        issues: {
            type: "array",
            items: { type: "object", additionalProperties: true },
            description: "Validation findings doctor would report for this record."
        }
    }
};

function listing(what) {
    return output(
        {
            records: {
                type: "array",
                items: RECORD_SUMMARY,
                description: `${what} matching the filters, in list projection.`
            },
            total: count("Matches before offset and limit were applied."),
            offset: count("Offset this page started at."),
            limit: count("Maximum this page could contain.")
        },
        ["records", "total"]
    );
}

const RECORD_RESULT = output({ record: RECORD_FULL }, ["record"]);

function annotations({ readOnly = false, destructive = false, idempotent = false }: any = {}) {
    return {
        readOnlyHint: readOnly,
        destructiveHint: destructive,
        idempotentHint: idempotent,
        openWorldHint: false
    };
}

function tool(definition) {
    return Object.freeze(definition);
}

function ensureMutable(context) {
    if (context.readOnly || context.workspace.readOnly) {
        throw new ConflictError(
            "MCP_SERVER_READ_ONLY",
            "This MCP server was started in read-only mode."
        );
    }
}

function invalidate(context) {
    context.indexStore?.invalidate();
}

/**
 * The actor to attribute a mutation to.
 *
 * Claims exist to keep two agents out of the same files, and they were never
 * used because every call had to invent an identifier by hand — the docs
 * suggested things like `agent-56a30d1b`. Falling back to the MCP client's own
 * name means claiming costs nothing to think about, which is the only way a
 * coordination mechanism actually gets used.
 */
function actorFor(context, provided) {
    return resolveActor({
        provided: optionalString(provided),
        clientName: context.clientInfo?.name
    }).actor;
}

function recordResult(record, extra: any = {}) {
    return { record, ...extra };
}

/**
 * A filtered, projected listing of one record kind.
 *
 * The gap this closes: none of the twenty-two tools could *list* anything, and
 * `project_search` refused an empty query — so "what is in doing?", the most
 * common question an agent has, was not expressible. The only way to answer it
 * was to read `.project/cards/*.md` directly, which is the token spend this
 * protocol exists to avoid.
 */
async function listRecords(context, kind, args) {
    const kinds = Array.isArray(kind) ? kind : [kind];
    const wanted = (value, name) => {
        const list = stringList(value, name);
        return list?.length ? new Set(list) : null;
    };
    const filters = {
        status: wanted(args.status, "status"),
        area: wanted(args.area, "area"),
        type: wanted(args.type, "type"),
        priority: wanted(args.priority, "priority"),
        collection: wanted(args.collection, "collection"),
        visibility: wanted(args.visibility, "visibility"),
        kind: wanted(args.kind, "kind"),
        tags: stringList(args.tags, "tags")
    };
    const parent = optionalString(args.parent);
    const claimedBy = optionalString(args.claimedBy);
    // Same validator the CLI uses, so the two surfaces cannot disagree about
    // what a date is. Unvalidated, `2026-7-1` matched nothing and returned
    // `total: 0` — which an agent reads as "nothing changed".
    const updatedSince = dateBoundary(args.updatedSince, {
        label: "updatedSince",
        code: "MCP_ARGUMENT_INVALID"
    });
    const index = await context.indexStore.get();

    const matches = index.records.filter((record) => {
        if (!kinds.includes(record.kind)) return false;
        if (filters.status && !filters.status.has(record.status)) return false;
        if (filters.area && !filters.area.has(record.area)) return false;
        if (filters.type && !filters.type.has(record.recordType)) return false;
        if (filters.kind && !filters.kind.has(record.documentKind)) return false;
        if (filters.priority && !filters.priority.has(record.priority)) return false;
        if (filters.collection && !filters.collection.has(record.collection)) {
            return false;
        }
        if (filters.visibility && !filters.visibility.has(record.visibility)) {
            return false;
        }
        if (parent && record.parent !== parent) return false;
        if (claimedBy && record.claimed_by !== claimedBy) return false;
        if (args.unclaimed === true && record.claimed_by) return false;
        if (typeof args.managed === "boolean" && record.managed !== args.managed) {
            return false;
        }
        if (updatedSince && String(record.updated || "") < updatedSince) {
            return false;
        }
        if (
            filters.tags?.length &&
            !filters.tags.some((tag) => (record.tags || []).includes(tag))
        ) {
            return false;
        }
        return true;
    });
    const offset = boundedInteger(args.offset, {
        name: "offset",
        fallback: 0,
        minimum: 0,
        maximum: 100_000
    });
    const limit = boundedInteger(args.limit, {
        name: "limit",
        fallback: 50,
        maximum: 200
    });
    const page = matches.slice(offset, offset + limit);
    return {
        // `list` rather than `summary`: a listing is for choosing, and an
        // excerpt per record adds up fast at fifty of them.
        records: page.map((record) => projectRecord(record, "list")),
        total: matches.length,
        offset,
        limit
    };
}

/**
 * The MCP face of the shared ranking in `modules/cards/next.ts`.
 *
 * The ranking used to live here, which made it reachable from this surface and
 * no other: `workfile next` did not exist, so a session driving the CLI had no
 * way to meet it. Moving it out was the fix; this stays as argument handling
 * and record projection.
 */
async function nextCards(context, args) {
    const index = await context.indexStore.get();
    const { candidates, total } = rankNextCards(index.records, {
        actor: actorFor(context, args.actor),
        areas: stringList(args.area, "area"),
        limit: boundedInteger(args.limit, {
            name: "limit",
            fallback: NEXT_DEFAULT_LIMIT,
            maximum: NEXT_MAXIMUM_LIMIT
        })
    });
    return {
        records: candidates.map(({ record, reason }) => ({
            ...projectRecord(record, "list"),
            reason
        })),
        total
    };
}

const TOOL_DEFINITIONS = [
    tool({
        name: "project_workspace",
        title: "Read project workspace",
        description:
            "Return the effective Workfile workspace, schema, enabled modules and mutation mode. Read this first when a vocabulary is project-declared: it reports the areas, axes, document kinds, changelog types and memory collections this project accepts.",
        inputSchema: schema({}),
        outputSchema: output(
            {
                name: text("Project name from project.config.mjs."),
                root: text("Absolute path to the workspace root."),
                version: {
                    type: "object",
                    additionalProperties: true,
                    description: "Schema version the workspace was created with."
                },
                schema: {
                    type: "object",
                    additionalProperties: true,
                    description:
                        "Effective vocabularies and paths per module: cards (statuses, types, priorities, efforts, areas, axes), docs, memory, changelog, agents, ci, mcp and search."
                },
                readOnly: flag(
                    "Whether this server refuses mutations, from --read-only or mcp.allowMutations."
                )
            },
            ["name", "root", "readOnly"]
        ),
        annotations: annotations({ readOnly: true, idempotent: true }),
        readOnly: true,
        async execute(_arguments, context) {
            return {
                name: context.workspace.config.name,
                root: context.workspace.root,
                version: context.workspace.version,
                schema: context.workspace.schema,
                readOnly: Boolean(context.readOnly || context.workspace.readOnly)
            };
        }
    }),
    tool({
        name: "project_search",
        title: "Search project records",
        description:
            "Search cards, documentation, changelog entries, releases and durable memory. Uses deterministic lexical ranking and an injected semantic provider when available.",
        inputSchema: schema(
            {
                query: identifier(
                    "Free text. Matched against titles, bodies and tags; never empty."
                ),
                kinds: strings(
                    "Restrict to these record families: card, doc, change, release, memory. Omit to search all of them."
                ),
                limit: count("Maximum records to return.", {
                    minimum: 1,
                    maximum: 100,
                    default: 20
                }),
                mode: choice(
                    ["lexical", "hybrid"],
                    "hybrid adds the injected semantic provider when the host configured one and falls back to lexical when it did not. lexical is deterministic.",
                    { default: "hybrid" }
                ),
                view: choice(
                    ["summary", "full"],
                    "summary omits record bodies and returns an excerpt; full returns everything, which costs far more tokens at the same limit.",
                    { default: "summary" }
                )
            },
            ["query"]
        ),
        outputSchema: output(
            {
                records: {
                    type: "array",
                    items: {
                        ...RECORD_SUMMARY,
                        description:
                            "A match, carrying searchScore and — in summary view — excerpt."
                    },
                    description: "Matches, best-scoring first."
                },
                total: count("Matches found before limit was applied."),
                offset: count("Offset this page started at."),
                limit: count("Maximum this page could contain."),
                view: text("Which projection was applied: summary or full."),
                mode: text("Which ranking ran: lexical or hybrid."),
                provider: text(
                    "Semantic provider that contributed, or null when ranking was purely lexical."
                )
            },
            ["records", "total"]
        ),
        annotations: annotations({ readOnly: true, idempotent: true }),
        readOnly: true,
        async execute(args, context) {
            const index = await context.indexStore.get();
            const requestedMode = args.mode || "hybrid";
            return searchProjectRecordsHybrid(index.records, requiredString(args.query, "query"), {
                provider: requestedMode === "hybrid" ? context.searchProvider : null,
                kinds: stringList(args.kinds, "kinds") || [],
                limit: boundedInteger(args.limit, {
                    name: "limit",
                    fallback: 20,
                    maximum: 100
                }),
                // Compact by default: a search is a shortlist, and returning
                // every matched body was costing more tokens than reading the
                // files would have.
                view: args.view === "full" ? "full" : "summary",
                semanticWeight: context.workspace.config.search.semanticWeight,
                maxProviderRecords: context.workspace.config.search.maxProviderRecords
            });
        }
    }),
    tool({
        name: "project_get_record",
        title: "Read a project record",
        description:
            "Read one canonical project record by stable ID, including body, revision, outgoing references, backlinks and health signals. The revision it returns is what a later write passes as expectedRevision.",
        inputSchema: schema(
            {
                id: identifier(
                    "Stable record ID of any family: T-0042, DOC-0003, CHG-0101, REL-0007, ADR-0009."
                )
            },
            ["id"]
        ),
        outputSchema: RECORD_RESULT,
        annotations: annotations({ readOnly: true, idempotent: true }),
        readOnly: true,
        async execute(args, context) {
            const index = await context.indexStore.get();
            const id = requiredString(args.id, "id");
            const record = findProjectRecord(index, id);
            if (!record) {
                throw new NotFoundError(
                    "RECORD_NOT_FOUND",
                    `Project record not found: ${id}`
                );
            }
            return recordResult(record);
        }
    }),
    tool({
        name: "project_doctor",
        title: "Run workfile doctor",
        description:
            "Validate Work, Docs, History, Memory, agent instructions, CI templates and cross-record references. Run before declaring work finished.",
        inputSchema: schema({
            checkPaths: flag(
                "Also verify that paths referenced by records exist on disk. Set false to skip the filesystem walk on a large repository.",
                { default: true }
            )
        }),
        outputSchema: output(
            {
                ok: flag("True when no error-severity issue was found."),
                generatedAt: text("When this run completed, as an RFC 3339 timestamp."),
                cards: count("Cards inspected."),
                modules: {
                    type: "object",
                    additionalProperties: true,
                    description: "Record counts per module and collection."
                },
                counts: {
                    type: "object",
                    additionalProperties: true,
                    description: "Issue counts by severity: error, warning, info."
                },
                issues: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                    description: "Findings, each with a severity, a code and the record it concerns."
                }
            },
            ["ok", "issues"]
        ),
        annotations: annotations({ readOnly: true, idempotent: true }),
        readOnly: true,
        async execute(args, context) {
            return runDoctor(context.workspace, {
                checkPaths: args.checkPaths !== false,
                integrationRegistry: context.integrationRegistry
            });
        }
    }),
    tool({
        name: "project_agent_context",
        title: "Build bounded agent context",
        description:
            "Build a compact context bundle around a card from direct relations, active conventions, open incidents and active project context. Prefer this over reading records one by one before working on a card.",
        inputSchema: schema(
            {
                cardId: identifier("Card the bundle is centred on, e.g. T-0042."),
                limit: count("Maximum related records to include.", {
                    minimum: 1,
                    maximum: 50,
                    default: 20
                })
            },
            ["cardId"]
        ),
        outputSchema: output(
            {
                focus: text("ID of the card the bundle was built around."),
                provenance: {
                    type: "object",
                    additionalProperties: true,
                    description:
                        "Which records this card came out of, and which came out of it. Both are read off the origin field, so the direction is exact — the graph edge alone cannot tell provenance from any other explicit link.",
                    properties: {
                        origin: strings("Records this card was discovered while working on."),
                        spawned: strings("Cards that declare this record as their origin.")
                    }
                },
                generatedAt: text("When the bundle was assembled, RFC 3339."),
                truncated: flag("True when relevant records were dropped to respect limit."),
                totalAvailable: count("Related records before limit was applied."),
                records: {
                    type: "array",
                    items: RECORD_FULL,
                    description: "The selected records, with bodies."
                },
                markdown: text("The same bundle rendered as Markdown, ready to paste into a prompt.")
            },
            ["focus", "records"]
        ),
        annotations: annotations({ readOnly: true, idempotent: true }),
        readOnly: true,
        async execute(args, context) {
            return buildAgentContext(context.workspace, {
                cardId: requiredString(args.cardId, "cardId"),
                limit: boundedInteger(args.limit, {
                    name: "limit",
                    fallback: 20,
                    maximum: 50
                })
            });
        }
    }),
    tool({
        name: "project_card_list",
        title: "List work cards",
        description:
            "List cards filtered by status, area, type, priority, parent or claim. Use before starting work; use project_search for full-text.",
        inputSchema: schema({
            status: strings(
                `Keep only these statuses; any match passes. One of: ${CARD_STATUSES.join(", ")}.`,
                { items: { type: "string", enum: [...CARD_STATUSES] } }
            ),
            area: strings(`Keep only these areas. ${WORKSPACE_VOCABULARY}`),
            type: strings(`Keep only these card types. One of: ${CARD_TYPES.join(", ")}.`, {
                items: { type: "string", enum: [...CARD_TYPES] }
            }),
            priority: strings(
                `Keep only these priorities. One of: ${CARD_PRIORITIES.join(", ")}.`,
                { items: { type: "string", enum: [...CARD_PRIORITIES] } }
            ),
            parent: text("Keep only direct children of this card ID."),
            claimedBy: text("Keep only cards claimed by this actor."),
            unclaimed: flag("Keep only cards nobody has claimed."),
            tags: strings("Keep cards carrying any of these tags."),
            updatedSince: text(
                "Only records updated on or after this date. YYYY-MM-DD; an RFC 3339 timestamp is read as its date.",
                { pattern: "^\\d{4}-\\d{2}-\\d{2}" }
            ),
            limit: count("Maximum cards to return.", {
                minimum: 1,
                maximum: 200,
                default: LIMIT_DEFAULT
            }),
            offset: count("Skip this many matches before the page starts.", {
                minimum: 0,
                default: 0
            })
        }),
        outputSchema: listing("Cards"),
        annotations: annotations({ readOnly: true, idempotent: true }),
        readOnly: true,
        async execute(args, context) {
            return listRecords(context, "card", args);
        }
    }),
    tool({
        name: "project_doc_list",
        title: "List documents",
        description:
            "List indexed and managed documents, filtered by kind, status or freshness.",
        inputSchema: schema({
            kind: strings(`Keep only these document kinds. ${WORKSPACE_VOCABULARY}`),
            status: strings(`Keep only these document statuses. ${WORKSPACE_VOCABULARY}`),
            managed: flag(
                "true keeps only documents Workfile owns under the managed docs root; false keeps only repository files it merely indexes."
            ),
            limit: count("Maximum documents to return.", {
                minimum: 1,
                maximum: 200,
                default: LIMIT_DEFAULT
            }),
            offset: count("Skip this many matches before the page starts.", {
                minimum: 0,
                default: 0
            })
        }),
        outputSchema: listing("Documents"),
        annotations: annotations({ readOnly: true, idempotent: true }),
        readOnly: true,
        async execute(args, context) {
            return listRecords(context, "doc", args);
        }
    }),
    tool({
        name: "project_changelog_list",
        title: "List change fragments and releases",
        description:
            "List unreleased change fragments and cut releases, filtered by type, area or visibility.",
        inputSchema: schema({
            type: strings(`Keep only these change types. ${WORKSPACE_VOCABULARY}`),
            area: strings(`Keep only these areas. ${WORKSPACE_VOCABULARY}`),
            visibility: strings(
                `Keep only these visibilities, typically public or internal. ${WORKSPACE_VOCABULARY}`
            ),
            released: flag(
                "true keeps only fragments already consumed by a release; false keeps only unreleased ones."
            ),
            limit: count("Maximum records to return.", {
                minimum: 1,
                maximum: 200,
                default: LIMIT_DEFAULT
            }),
            offset: count("Skip this many matches before the page starts.", {
                minimum: 0,
                default: 0
            })
        }),
        outputSchema: listing("Change fragments and releases"),
        annotations: annotations({ readOnly: true, idempotent: true }),
        readOnly: true,
        async execute(args, context) {
            return listRecords(context, ["change", "release"], args);
        }
    }),
    tool({
        name: "project_memory_list",
        title: "List durable memory",
        description:
            "List learnings, decisions, incidents, conventions and context, filtered by collection or lifecycle status.",
        inputSchema: schema({
            collection: strings(
                "Keep only these collections: learnings, decisions, incidents, conventions, context.",
                {
                    items: {
                        type: "string",
                        enum: ["learnings", "decisions", "incidents", "conventions", "context"]
                    }
                }
            ),
            status: strings(
                `Keep only these lifecycle statuses. Each collection has its own vocabulary — a decision is proposed or accepted, an incident is open or resolved. ${WORKSPACE_VOCABULARY}`
            ),
            limit: count("Maximum records to return.", {
                minimum: 1,
                maximum: 200,
                default: LIMIT_DEFAULT
            }),
            offset: count("Skip this many matches before the page starts.", {
                minimum: 0,
                default: 0
            })
        }),
        outputSchema: listing("Memory records"),
        annotations: annotations({ readOnly: true, idempotent: true }),
        readOnly: true,
        async execute(args, context) {
            return listRecords(context, "memory", args);
        }
    }),
    tool({
        name: "project_next",
        title: "What to work on next",
        description:
            "Rank actionable cards: unblocked, unclaimed or claimed by you, highest priority first. Answers \"what should I do now\".",
        inputSchema: schema({
            actor: ACTOR,
            area: strings(`Rank only cards in these areas. ${WORKSPACE_VOCABULARY}`),
            limit: count("Maximum candidates to rank.", {
                minimum: 1,
                maximum: NEXT_MAXIMUM_LIMIT,
                default: NEXT_DEFAULT_LIMIT
            })
        }),
        outputSchema: output(
            {
                records: {
                    type: "array",
                    items: {
                        ...RECORD_SUMMARY,
                        description:
                            "A ranked candidate, carrying `reason` — why the ranking surfaced it."
                    },
                    description: "Candidates, most actionable first."
                },
                total: count("Actionable cards found before limit was applied.")
            },
            ["records", "total"]
        ),
        annotations: annotations({ readOnly: true, idempotent: true }),
        readOnly: true,
        async execute(args, context) {
            return nextCards(context, args);
        }
    }),
    tool({
        name: "project_card_create",
        title: "Create a work card",
        description:
            "Create one canonical Work card with a concurrency-safe stable ID. Search first: this mints a new record rather than finding an existing one.",
        inputSchema: schema(
            {
                title: text("What the card is about, in one line.", {
                    minLength: 1,
                    maxLength: 80
                }),
                status: choice(CARD_STATUSES, "Starting lifecycle status.", {
                    default: "backlog"
                }),
                type: choice(CARD_TYPES, "What kind of work this is."),
                priority: choice(CARD_PRIORITIES, "How urgent the work is."),
                area: text(`Part of the system this touches. ${WORKSPACE_VOCABULARY}`),
                parent: text(
                    "ID of the parent card. The hierarchy is bounded by cards.maxHierarchyDepth."
                ),
                depends: strings(
                    "IDs of cards that must close first. Blocks this card from being ranked as actionable."
                ),
                source: text("Where the work came from: an issue URL, a person, a meeting."),
                tags: strings("Free-form tags for filtering."),
                scope: strings(
                    "Repository paths this work will change. Declared here, enforced when the card is claimed."
                ),
                related: strings("IDs of records worth reading alongside this one."),
                origin: strings(
                    "IDs of the records this work came out of — the card being worked when it was discovered, the decision that spawned it. Any record kind, not cards only. Unlike parent, it does not make this card part of them."
                ),
                effort: choice(CARD_EFFORTS, "Rough size: S, M or L."),
                start: text("Planned start date, YYYY-MM-DD."),
                due: text("Target completion date, YYYY-MM-DD."),
                body: BODY,
                // A container rather than a property per axis: this schema is
                // static and axes are declared per project, so the axis name
                // has to travel in the data. `project_workspace` reports which
                // ones exist and what each accepts.
                axes: AXES_OBJECT
            },
            ["title"]
        ),
        outputSchema: RECORD_RESULT,
        annotations: annotations(),
        readOnly: false,
        async execute(args, context) {
            ensureMutable(context);
            const result = await createCard(context.workspace, {
                ...args,
                title: requiredString(args.title, "title"),
                depends: stringList(args.depends, "depends"),
                tags: stringList(args.tags, "tags"),
                scope: stringList(args.scope, "scope"),
                related: stringList(args.related, "related"),
                origin: stringList(args.origin, "origin")
            });
            invalidate(context);
            return recordResult(recordFromCard(context.workspace, result.card));
        }
    }),
    tool({
        name: "project_card_claim",
        title: "Claim a work card",
        description:
            "Claim a card for an actor, move it to doing and optionally declare the filesystem scope that will be changed. Claim before editing anything the card covers; another actor's claim is refused unless forced.",
        inputSchema: schema(
            {
                id: identifier("Card to claim, e.g. T-0042."),
                actor: text(
                    "Who is claiming. Defaults to the MCP client's own name; a hand-typed value will not match the identity the edit guard sees.",
                    { minLength: 1 }
                ),
                scope: strings(
                    "Repository paths this claim covers. Overlapping scopes are what stop two agents editing the same files."
                ),
                force: flag(
                    "Take a claim another actor already holds. Requires reason.",
                    { default: false }
                ),
                reason: text("Why the existing claim is being taken over. Recorded on the card."),
                expectedRevision: EXPECTED_REVISION
            },
            ["id", "actor"]
        ),
        outputSchema: output(
            {
                record: RECORD_FULL,
                warnings: strings(
                    "Non-fatal findings, such as a stale claim that was taken over."
                )
            },
            ["record"]
        ),
        annotations: annotations(),
        readOnly: false,
        async execute(args, context) {
            ensureMutable(context);
            const result = await claimCard(context.workspace, requiredString(args.id, "id"), {
                actor: actorFor(context, args.actor),
                scope: stringList(args.scope, "scope"),
                force: Boolean(args.force),
                reason: optionalString(args.reason),
                expectedRevision: optionalString(args.expectedRevision)
            });
            invalidate(context);
            return recordResult(recordFromCard(context.workspace, result.card), {
                warnings: result.warnings
            });
        }
    }),
    tool({
        name: "project_card_release",
        title: "Release a claim",
        description:
            "Release your claim on a card and move it out of doing. Call when work stops, finished or not.",
        inputSchema: schema(
            {
                id: identifier("Card whose claim is being released."),
                actor: ACTOR,
                status: choice(
                    CARD_STATUSES.filter((value) => value !== "doing"),
                    "Status to leave the card in. Omit to keep the current one — a card just moved to done is not demoted by releasing it — except doing, which becomes next because active work without a claimant is a contradiction. doing is refused as an explicit target.",
                    {}
                ),
                force: flag("Release a claim held by another actor. Requires reason.", {
                    default: false
                }),
                reason: text("Why another actor's claim is being released. Recorded on the card."),
                expectedRevision: EXPECTED_REVISION
            },
            ["id"]
        ),
        outputSchema: RECORD_RESULT,
        annotations: annotations({ idempotent: true }),
        async execute(args, context) {
            const result = await releaseCard(
                context.workspace,
                requiredString(args.id, "id"),
                {
                    actor: actorFor(context, args.actor),
                    status: optionalString(args.status),
                    force: args.force === true,
                    reason: optionalString(args.reason),
                    expectedRevision: optionalString(args.expectedRevision)
                }
            );
            invalidate(context);
            return recordResult(recordFromCard(context.workspace, result.card));
        }
    }),
    tool({
        name: "project_card_write",
        title: "Replace a card body",
        description:
            "Replace the Markdown body of a card under the protocol's lock and revision check. Use project_card_note to append instead.",
        inputSchema: schema(
            {
                id: identifier("Card whose body is being replaced."),
                body: text(
                    "The complete new Markdown body. This overwrites, so read the card first unless you intend to discard what is there. The content of ## Activity and ## Notes is append-only and comes from the stored card; anything you send under those headings is reported back in `ignored`."
                ),
                expectedRevision: EXPECTED_REVISION
            },
            ["id", "body"]
        ),
        outputSchema: output(
            {
                record: RECORD_FULL,
                ignored: strings(
                    "Protocol headings whose content was not taken from the sent body. Empty when the write applied in full."
                )
            },
            ["record"]
        ),
        annotations: annotations({}),
        async execute(args, context) {
            const result = await patchCardBody(
                context.workspace,
                requiredString(args.id, "id"),
                {
                    body: String(args.body ?? ""),
                    expectedRevision: optionalString(args.expectedRevision)
                }
            );
            invalidate(context);
            return recordResult(recordFromCard(context.workspace, result.card), {
                ignored: result.ignored
            });
        }
    }),
    tool({
        name: "project_card_note",
        title: "Append a note to a card",
        description:
            "Append one timestamped line under a heading. Cheaper than rewriting the body and safe when two agents write at once.",
        inputSchema: schema(
            {
                id: identifier("Card to append to."),
                text: identifier("The line to append. One observation, not a paragraph."),
                section: text(
                    "Heading to append under. Created if it does not exist yet.",
                    { default: "Notes" }
                ),
                actor: ACTOR
            },
            ["id", "text"]
        ),
        outputSchema: RECORD_RESULT,
        annotations: annotations({}),
        async execute(args, context) {
            const result = await appendCardNote(
                context.workspace,
                requiredString(args.id, "id"),
                {
                    text: requiredString(args.text, "text"),
                    section: optionalString(args.section) || "Notes",
                    actor: actorFor(context, args.actor)
                }
            );
            invalidate(context);
            return recordResult(recordFromCard(context.workspace, result.card));
        }
    }),
    tool({
        name: "project_card_transition",
        title: "Transition a work card",
        description:
            "Move a card to another protocol status. Moving to doing claims the card for the actor; review means the implementation is finished but unverified, and done requires evidence it ran, not a commit.",
        inputSchema: schema(
            {
                id: identifier("Card to transition."),
                status: choice(
                    CARD_STATUSES,
                    "Target status. backlog: identified, uncommitted. next: prioritized. doing: actively worked, and claimed by the actor. review: implemented, awaiting verification. blocked: externally blocked, record why. deferred: postponed on purpose, record why. done: verified where it actually runs. discarded: will not be done, record why."
                ),
                actor: ACTOR,
                scope: strings(
                    "Repository paths to claim when moving to doing. Ignored by the other statuses."
                ),
                expectedRevision: EXPECTED_REVISION
            },
            ["id", "status"]
        ),
        outputSchema: RECORD_RESULT,
        annotations: annotations(),
        readOnly: false,
        async execute(args, context) {
            ensureMutable(context);
            const result = await transitionCard(
                context.workspace,
                requiredString(args.id, "id"),
                requiredString(args.status, "status"),
                {
                    actor: actorFor(context, args.actor),
                    scope: stringList(args.scope, "scope"),
                    expectedRevision: optionalString(args.expectedRevision)
                }
            );
            invalidate(context);
            return recordResult(recordFromCard(context.workspace, result.card));
        }
    }),
    tool({
        name: "project_card_patch",
        title: "Patch a work card",
        description:
            "Patch allowed card metadata using optimistic concurrency. Use expectedRevision whenever the card was read earlier. " +
            "Declared axes go in changes.axes as { name: value }; an empty value clears one.",
        inputSchema: schema(
            {
                id: identifier("Card to patch."),
                changes: {
                    type: "object",
                    additionalProperties: true,
                    description:
                        "Frontmatter fields to overwrite, e.g. { priority: \"high\", tags: [\"mcp\"] }. Only the keys present are touched. Use project_card_transition for status and project_card_write for the body; declared axes go under an axes key."
                },
                expectedRevision: EXPECTED_REVISION
            },
            ["id", "changes"]
        ),
        outputSchema: RECORD_RESULT,
        annotations: annotations({ idempotent: true }),
        readOnly: false,
        async execute(args, context) {
            ensureMutable(context);
            const result = await patchCard(
                context.workspace,
                requiredString(args.id, "id"),
                plainObject(args.changes, "changes"),
                {
                    expectedRevision: optionalString(args.expectedRevision),
                    actor: actorFor(context, args.actor),
                    force: args.force === true
                }
            );
            invalidate(context);
            return recordResult(recordFromCard(context.workspace, result.card));
        }
    }),
    tool({
        name: "project_card_archive",
        title: "Archive a closed work card",
        description:
            "Move a closed card to the canonical archive directory. Only done and discarded cards can be archived; the ID and the file survive, so project_card_reopen undoes this.",
        inputSchema: schema(
            {
                id: identifier("Card to archive. Must already be done or discarded."),
                expectedRevision: EXPECTED_REVISION
            },
            ["id"]
        ),
        outputSchema: RECORD_RESULT,
        annotations: annotations({ destructive: true }),
        readOnly: false,
        async execute(args, context) {
            ensureMutable(context);
            const result = await archiveCard(context.workspace, requiredString(args.id, "id"), {
                expectedRevision: optionalString(args.expectedRevision)
            });
            invalidate(context);
            return recordResult(recordFromCard(context.workspace, result.card));
        }
    }),
    tool({
        name: "project_card_reopen",
        title: "Reopen an archived work card",
        description:
            "Move an archived card back out of the archive directory and into a live status. The ID never changes, so every existing reference to it keeps resolving.",
        inputSchema: schema(
            {
                id: identifier("Archived card to bring back."),
                status: choice(CARD_STATUSES, "Status to reopen into.", {
                    default: "backlog"
                }),
                actor: ACTOR,
                expectedRevision: EXPECTED_REVISION
            },
            ["id"]
        ),
        outputSchema: RECORD_RESULT,
        annotations: annotations(),
        readOnly: false,
        async execute(args, context) {
            ensureMutable(context);
            const result = await reopenCard(context.workspace, requiredString(args.id, "id"), {
                status: optionalString(args.status) || "backlog",
                actor: actorFor(context, args.actor),
                expectedRevision: optionalString(args.expectedRevision)
            });
            invalidate(context);
            return recordResult(recordFromCard(context.workspace, result.card));
        }
    }),
    tool({
        name: "project_doc_create",
        title: "Create managed documentation",
        description:
            "Create a managed Markdown document with a stable DOC ID. Without an explicit folder the workspace docs.layout decides where it is written.",
        inputSchema: schema(
            {
                title: identifier("What the document is about, in one line."),
                kind: text(
                    `What sort of document this is — architecture, runbook, reference and so on. ${WORKSPACE_VOCABULARY}`
                ),
                status: text(
                    `Lifecycle status, typically draft or current. ${WORKSPACE_VOCABULARY}`
                ),
                folder: text(
                    "Folder below the managed docs root. Omit to let docs.layout decide; an empty string writes to the root."
                ),
                owners: strings("Who is answerable for keeping this accurate."),
                related: strings("IDs of records worth reading alongside this one."),
                supersedes: strings(
                    "IDs of documents this replaces. They are marked superseded."
                ),
                scope: strings("Subject matter this document covers — topics, not file paths."),
                tags: strings("Free-form tags for filtering."),
                source: text("Where the content came from: a URL, a person, a meeting."),
                review_after: text(
                    "Date after which this goes stale, YYYY-MM-DD. Defaults to docs.reviewIntervalDays from now."
                ),
                body: BODY
            },
            ["title"]
        ),
        outputSchema: RECORD_RESULT,
        annotations: annotations(),
        readOnly: false,
        async execute(args, context) {
            ensureMutable(context);
            const result = await createManagedDocument(context.workspace, {
                ...args,
                title: requiredString(args.title, "title"),
                owners: stringList(args.owners, "owners"),
                related: stringList(args.related, "related"),
                supersedes: stringList(args.supersedes, "supersedes"),
                scope: stringList(args.scope, "scope"),
                tags: stringList(args.tags, "tags")
            });
            invalidate(context);
            return recordResult(recordFromDocument(result.document));
        }
    }),
    tool({
        name: "project_doc_move",
        title: "Move managed documentation",
        description:
            "Move a managed document to another folder below the managed docs root. The DOC ID never changes; use an empty folder for the root.",
        inputSchema: schema(
            {
                id: identifier("Managed document to move, e.g. DOC-0003."),
                folder: text(
                    "Destination folder relative to the managed docs root. An empty string moves it to the root."
                ),
                expectedRevision: EXPECTED_REVISION
            },
            ["id", "folder"]
        ),
        outputSchema: RECORD_RESULT,
        annotations: annotations({ idempotent: true }),
        readOnly: false,
        async execute(args, context) {
            ensureMutable(context);
            const result = await moveManagedDocument(
                context.workspace,
                requiredString(args.id, "id"),
                {
                    folder: String(args.folder ?? ""),
                    expectedRevision: optionalString(args.expectedRevision)
                }
            );
            invalidate(context);
            return recordResult(recordFromDocument(result.document));
        }
    }),
    tool({
        name: "project_doc_patch",
        title: "Patch managed documentation",
        description:
            "Patch a managed document using optimistic concurrency. Indexed repository docs are intentionally read-only through this tool — edit those files directly.",
        inputSchema: schema(
            {
                id: identifier("Managed document to patch, e.g. DOC-0003."),
                changes: {
                    type: "object",
                    additionalProperties: true,
                    description:
                        "Frontmatter fields to overwrite, plus body to replace the Markdown. Only the keys present are touched. Use project_doc_move to change the folder."
                },
                expectedRevision: EXPECTED_REVISION
            },
            ["id", "changes"]
        ),
        outputSchema: RECORD_RESULT,
        annotations: annotations({ idempotent: true }),
        readOnly: false,
        async execute(args, context) {
            ensureMutable(context);
            const result = await patchManagedDocument(
                context.workspace,
                requiredString(args.id, "id"),
                plainObject(args.changes, "changes"),
                { expectedRevision: optionalString(args.expectedRevision) }
            );
            invalidate(context);
            return recordResult(recordFromDocument(result.document));
        }
    }),
    tool({
        name: "project_changelog_add",
        title: "Add a changelog fragment",
        description:
            "Create an atomic unreleased changelog fragment and relate it to cards, decisions or other records. One fragment per user-visible change, written when the change lands rather than when the release is cut.",
        inputSchema: schema(
            {
                title: identifier(
                    "The change, stated from the reader's side rather than the implementer's."
                ),
                type: text(
                    `What kind of change this is — added, changed, fixed and so on. ${WORKSPACE_VOCABULARY}`
                ),
                area: text(`Part of the system that changed. ${WORKSPACE_VOCABULARY}`),
                visibility: text(
                    `Who the entry is rendered for, typically public or internal. ${WORKSPACE_VOCABULARY}`
                ),
                cards: strings("IDs of the cards this change came from."),
                issues: strings("External issue or ticket references."),
                decisions: strings("IDs of decision records this change implements."),
                related: strings("IDs of other records worth reading alongside."),
                tags: strings("Free-form tags for filtering."),
                body: BODY
            },
            ["title"]
        ),
        outputSchema: RECORD_RESULT,
        annotations: annotations(),
        readOnly: false,
        async execute(args, context) {
            ensureMutable(context);
            const result = await createChangeFragment(context.workspace, {
                ...args,
                title: requiredString(args.title, "title"),
                cards: stringList(args.cards, "cards"),
                issues: stringList(args.issues, "issues"),
                decisions: stringList(args.decisions, "decisions"),
                related: stringList(args.related, "related"),
                tags: stringList(args.tags, "tags")
            });
            invalidate(context);
            return recordResult(recordFromChange(result.fragment));
        }
    }),
    tool({
        name: "project_changelog_patch",
        title: "Patch a changelog fragment",
        description:
            "Patch an unreleased changelog fragment using optimistic concurrency. Only works before a release consumes the fragment; afterwards the text belongs to that release.",
        inputSchema: schema(
            {
                id: identifier("Unreleased fragment to patch, e.g. CHG-0101."),
                changes: {
                    type: "object",
                    additionalProperties: true,
                    description:
                        "Frontmatter fields to overwrite — title, type, area, visibility, tags and the relation lists — plus body to replace the Markdown. Only the keys present are touched."
                },
                expectedRevision: EXPECTED_REVISION
            },
            ["id", "changes"]
        ),
        outputSchema: RECORD_RESULT,
        annotations: annotations({ idempotent: true }),
        readOnly: false,
        async execute(args, context) {
            ensureMutable(context);
            const result = await patchChangeFragment(
                context.workspace,
                requiredString(args.id, "id"),
                plainObject(args.changes, "changes"),
                { expectedRevision: optionalString(args.expectedRevision) }
            );
            invalidate(context);
            return recordResult(recordFromChange(result.fragment));
        }
    }),
    tool({
        name: "project_changelog_preview",
        title: "Preview a release",
        description:
            "Render selected unreleased fragments without mutating the repository. Use to read a release before project_changelog_release makes it permanent.",
        inputSchema: schema({
            fragmentIds: strings(
                "Fragments to include, e.g. CHG-0101. Omit to preview every unreleased fragment."
            ),
            visibility: text(
                `Render only entries at this visibility, typically public or internal. Omit to include all of them. ${WORKSPACE_VOCABULARY}`
            )
        }),
        outputSchema: output(
            {
                fragments: {
                    type: "array",
                    items: RECORD_SUMMARY,
                    description: "Fragments this preview covered."
                },
                groups: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                    description: "Entries bucketed by change type, in render order."
                },
                markdown: text("The release notes as they would be written.")
            },
            ["markdown"]
        ),
        annotations: annotations({ readOnly: true, idempotent: true }),
        readOnly: true,
        async execute(args, context) {
            return previewRelease(context.workspace, {
                fragmentIds: stringList(args.fragmentIds, "fragmentIds"),
                visibility: optionalString(args.visibility)
            });
        }
    }),
    tool({
        name: "project_changelog_release",
        title: "Create a release",
        description:
            "Consume selected unreleased fragments and create a canonical release record. This moves fragment files into the release directory, so preview first: the fragments stop being separately editable.",
        inputSchema: schema(
            {
                version: identifier(
                    "Version being cut, e.g. 0.5.4. Validated against changelog.releaseStrategy."
                ),
                title: text("Release title. Defaults to the version itself."),
                date: text("Release date, YYYY-MM-DD. Defaults to today."),
                fragmentIds: strings(
                    "Fragments to consume, e.g. CHG-0101. Omit to consume every unreleased fragment."
                ),
                visibility: text(
                    `Visibility of the release record itself, typically public or internal. ${WORKSPACE_VOCABULARY}`
                ),
                commit: text("Commit SHA this release was cut from."),
                tags: strings("Free-form tags for filtering."),
                body: text("Markdown prelude written above the generated entries.")
            },
            ["version"]
        ),
        outputSchema: output(
            {
                record: {
                    ...RECORD_FULL,
                    description: "The release record that was created."
                },
                consumedFragments: {
                    type: "array",
                    items: RECORD_SUMMARY,
                    description:
                        "Fragments that moved into the release directory and no longer exist as unreleased records."
                }
            },
            ["record", "consumedFragments"]
        ),
        annotations: annotations({ destructive: true }),
        readOnly: false,
        async execute(args, context) {
            ensureMutable(context);
            const result = await createRelease(context.workspace, {
                ...args,
                version: requiredString(args.version, "version"),
                fragmentIds: stringList(args.fragmentIds, "fragmentIds"),
                tags: stringList(args.tags, "tags")
            });
            invalidate(context);
            return {
                record: recordFromRelease(result.release),
                consumedFragments: result.fragments.map(recordFromChange)
            };
        }
    }),
    tool({
        name: "project_memory_add",
        title: "Add workfile memory",
        description:
            "Create a typed learning, decision, incident, convention or temporary context record. For knowledge that should change future behaviour — not for narrating what happened this session.",
        inputSchema: schema(
            {
                collection: choice(
                    ["learnings", "decisions", "incidents", "conventions", "context"],
                    "Which kind of memory this is. learnings: something discovered that changes how the next attempt goes. decisions: a choice made, with its rationale (ADR). incidents: something that broke, and what it cost. conventions: a rule the project now follows. context: temporary situational state, which expires."
                ),
                title: identifier("The knowledge itself, stated as a claim rather than a topic."),
                status: text(
                    `Lifecycle status. Each collection has its own vocabulary — a decision is proposed or accepted, an incident is open or resolved. ${WORKSPACE_VOCABULARY}`
                ),
                category: text("Optional sub-classification within the collection."),
                confidence: text(
                    "How well established this is — for learnings, whether it has been seen once or many times."
                ),
                occurrences: count("How many times this has been observed.", { minimum: 0 }),
                severity: text("For incidents: how bad it was."),
                started_at: text("For incidents: when it began, YYYY-MM-DD."),
                resolved_at: text("For incidents: when it was resolved, YYYY-MM-DD."),
                expires: text(
                    "For context: the date after which this stops being true, YYYY-MM-DD."
                ),
                review_after: text("Date after which this should be re-read, YYYY-MM-DD."),
                deciders: strings("For decisions: who made the call."),
                related: strings("IDs of records worth reading alongside this one."),
                supersedes: strings(
                    "IDs of memory records this replaces. Prefer project_memory_supersede, which updates both sides."
                ),
                graduated_to: strings(
                    "IDs of the durable records a learning has been promoted into."
                ),
                corrective_actions: strings(
                    "For incidents: IDs of the cards that stop it recurring."
                ),
                scope: strings("Subject matter this applies to — topics, not file paths."),
                owners: strings("Who is answerable for keeping this accurate."),
                tags: strings("Free-form tags for filtering."),
                body: BODY
            },
            ["collection", "title"]
        ),
        outputSchema: RECORD_RESULT,
        annotations: annotations(),
        readOnly: false,
        async execute(args, context) {
            ensureMutable(context);
            const collection = requiredString(args.collection, "collection");
            const result = await createMemoryRecord(context.workspace, collection, {
                ...args,
                title: requiredString(args.title, "title"),
                deciders: stringList(args.deciders, "deciders"),
                related: stringList(args.related, "related"),
                supersedes: stringList(args.supersedes, "supersedes"),
                graduated_to: stringList(args.graduated_to, "graduated_to"),
                corrective_actions: stringList(args.corrective_actions, "corrective_actions"),
                scope: stringList(args.scope, "scope"),
                owners: stringList(args.owners, "owners"),
                tags: stringList(args.tags, "tags")
            });
            invalidate(context);
            return recordResult(recordFromMemory(result.record));
        }
    }),
    tool({
        name: "project_memory_patch",
        title: "Patch workfile memory",
        description:
            "Patch a durable memory record using optimistic concurrency. To retire one in favour of another use project_memory_supersede, which updates both sides.",
        inputSchema: schema(
            {
                id: identifier("Memory record to patch: LRN-, ADR-, INC-, CONV- or CTX-."),
                changes: {
                    type: "object",
                    additionalProperties: true,
                    description:
                        "Frontmatter fields to overwrite — status, tags, related, owners and the collection-specific fields — plus body to replace the Markdown. Only the keys present are touched."
                },
                expectedRevision: EXPECTED_REVISION
            },
            ["id", "changes"]
        ),
        outputSchema: RECORD_RESULT,
        annotations: annotations({ idempotent: true }),
        readOnly: false,
        async execute(args, context) {
            ensureMutable(context);
            const result = await patchMemoryRecord(
                context.workspace,
                requiredString(args.id, "id"),
                plainObject(args.changes, "changes"),
                { expectedRevision: optionalString(args.expectedRevision) }
            );
            invalidate(context);
            return recordResult(recordFromMemory(result.record));
        }
    }),
    tool({
        name: "project_memory_graduate",
        title: "Graduate a learning",
        description:
            "Mark a learning as graduated and link it to the convention, decision or documentation that now carries the durable rule. Create the target record first — graduating points at something that must already exist.",
        inputSchema: schema(
            {
                id: identifier("Learning to graduate, e.g. LRN-0015."),
                targets: strings(
                    "IDs of the records that now carry the rule: a convention, a decision or a document."
                ),
                expectedRevision: EXPECTED_REVISION
            },
            ["id", "targets"]
        ),
        outputSchema: RECORD_RESULT,
        annotations: annotations(),
        readOnly: false,
        async execute(args, context) {
            ensureMutable(context);
            const result = await graduateLearning(
                context.workspace,
                requiredString(args.id, "id"),
                stringList(args.targets, "targets"),
                { expectedRevision: optionalString(args.expectedRevision) }
            );
            invalidate(context);
            return recordResult(recordFromMemory(result.record));
        }
    }),
    tool({
        name: "project_memory_supersede",
        title: "Supersede workfile memory",
        description:
            "Supersede one memory record with another and update both sides atomically. Create the replacement first; neither record is deleted, so the superseded one stays readable and its ID keeps resolving.",
        inputSchema: schema(
            {
                id: identifier("Memory record being retired."),
                replacementId: identifier(
                    "Memory record that replaces it. Must already exist."
                ),
                expectedRevision: EXPECTED_REVISION
            },
            ["id", "replacementId"]
        ),
        outputSchema: output(
            {
                record: { ...RECORD_FULL, description: "The superseded record." },
                replacement: { ...RECORD_FULL, description: "The record that replaces it." }
            },
            ["record", "replacement"]
        ),
        annotations: annotations(),
        readOnly: false,
        async execute(args, context) {
            ensureMutable(context);
            const result = await supersedeMemoryRecord(
                context.workspace,
                requiredString(args.id, "id"),
                requiredString(args.replacementId, "replacementId"),
                { expectedRevision: optionalString(args.expectedRevision) }
            );
            invalidate(context);
            return {
                record: recordFromMemory(result.record),
                replacement: recordFromMemory(result.replacement)
            };
        }
    })
].sort((left, right) => left.name.localeCompare(right.name));

export function listMcpTools({ readOnly = false }: any = {}) {
    return TOOL_DEFINITIONS.filter((definition) => !readOnly || definition.readOnly).map(
        ({ execute, readOnly: _readOnly, ...descriptor }) => descriptor
    );
}

export function inspectMcpTools() {
    return TOOL_DEFINITIONS.map(({ execute, ...definition }) => ({
        ...definition,
        mutating: !definition.readOnly
    }));
}

export async function callMcpTool(name, args, context) {
    const definition = TOOL_DEFINITIONS.find((candidate) => candidate.name === name);
    if (!definition) {
        throw new NotFoundError("MCP_TOOL_NOT_FOUND", `Unknown MCP tool: ${name}`);
    }
    if ((context.readOnly || context.workspace.readOnly) && !definition.readOnly) {
        ensureMutable(context);
    }
    return definition.execute(plainObject(args, "arguments"), context);
}
