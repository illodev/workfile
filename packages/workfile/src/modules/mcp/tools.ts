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
const STRING_ARRAY = { type: "array", items: { type: "string" } };

function schema(properties, required = []) {
    return {
        ...OBJECT,
        properties,
        ...(required.length ? { required } : {})
    };
}

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
            "Return the effective Workfile workspace, schema, enabled modules and mutation mode.",
        inputSchema: schema({}),
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
                query: { type: "string", minLength: 1 },
                kinds: STRING_ARRAY,
                limit: { type: "integer", minimum: 1, maximum: 100 },
                mode: { type: "string", enum: ["lexical", "hybrid"] },
                view: {
                    type: "string",
                    enum: ["summary", "full"],
                    description:
                        "summary (default) omits record bodies and returns an excerpt; full returns everything."
                }
            },
            ["query"]
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
            "Read one canonical project record by stable ID, including body, revision, outgoing references, backlinks and health signals.",
        inputSchema: schema({ id: { type: "string", minLength: 1 } }, ["id"]),
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
            "Validate Work, Docs, History, Memory, agent instructions, CI templates and cross-record references.",
        inputSchema: schema({
            checkPaths: { type: "boolean", description: "Check referenced filesystem paths." }
        }),
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
            "Build a compact context bundle around a card from direct relations, active conventions, open incidents and active project context.",
        inputSchema: schema(
            {
                cardId: { type: "string", minLength: 1 },
                limit: { type: "integer", minimum: 1, maximum: 50 }
            },
            ["cardId"]
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
            status: STRING_ARRAY,
            area: STRING_ARRAY,
            type: STRING_ARRAY,
            priority: STRING_ARRAY,
            parent: { type: "string" },
            claimedBy: { type: "string" },
            unclaimed: { type: "boolean" },
            tags: STRING_ARRAY,
            updatedSince: {
                type: "string",
                description:
                    "Only records updated on or after this date. YYYY-MM-DD; an RFC 3339 timestamp is read as its date.",
                pattern: "^\\d{4}-\\d{2}-\\d{2}"
            },
            limit: { type: "integer", minimum: 1, maximum: 200 },
            offset: { type: "integer", minimum: 0 }
        }),
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
            kind: STRING_ARRAY,
            status: STRING_ARRAY,
            managed: { type: "boolean" },
            limit: { type: "integer", minimum: 1, maximum: 200 },
            offset: { type: "integer", minimum: 0 }
        }),
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
            type: STRING_ARRAY,
            area: STRING_ARRAY,
            visibility: STRING_ARRAY,
            released: { type: "boolean" },
            limit: { type: "integer", minimum: 1, maximum: 200 },
            offset: { type: "integer", minimum: 0 }
        }),
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
            collection: STRING_ARRAY,
            status: STRING_ARRAY,
            limit: { type: "integer", minimum: 1, maximum: 200 },
            offset: { type: "integer", minimum: 0 }
        }),
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
            actor: { type: "string" },
            area: STRING_ARRAY,
            limit: { type: "integer", minimum: 1, maximum: 20 }
        }),
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
            "Create one canonical Work card with a concurrency-safe stable ID.",
        inputSchema: schema(
            {
                title: { type: "string", minLength: 1, maxLength: 80 },
                status: { type: "string" },
                type: { type: "string" },
                priority: { type: "string" },
                area: { type: "string" },
                parent: { type: "string" },
                depends: STRING_ARRAY,
                source: { type: "string" },
                tags: STRING_ARRAY,
                scope: STRING_ARRAY,
                related: STRING_ARRAY,
                effort: { type: "string" },
                start: { type: "string" },
                due: { type: "string" },
                body: { type: "string" }
            },
            ["title"]
        ),
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
                related: stringList(args.related, "related")
            });
            invalidate(context);
            return recordResult(recordFromCard(context.workspace, result.card));
        }
    }),
    tool({
        name: "project_card_claim",
        title: "Claim a work card",
        description:
            "Claim a card for an actor, move it to doing and optionally declare the filesystem scope that will be changed.",
        inputSchema: schema(
            {
                id: { type: "string", minLength: 1 },
                actor: { type: "string", minLength: 1 },
                scope: STRING_ARRAY,
                force: { type: "boolean" },
                reason: { type: "string" },
                expectedRevision: { type: "string" }
            },
            ["id", "actor"]
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
                id: { type: "string", minLength: 1 },
                actor: { type: "string" },
                status: { type: "string" },
                force: { type: "boolean" },
                reason: { type: "string" },
                expectedRevision: { type: "string" }
            },
            ["id"]
        ),
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
                id: { type: "string", minLength: 1 },
                body: { type: "string" },
                expectedRevision: { type: "string" }
            },
            ["id", "body"]
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
            return recordResult(recordFromCard(context.workspace, result.card));
        }
    }),
    tool({
        name: "project_card_note",
        title: "Append a note to a card",
        description:
            "Append one timestamped line under a heading. Cheaper than rewriting the body and safe when two agents write at once.",
        inputSchema: schema(
            {
                id: { type: "string", minLength: 1 },
                text: { type: "string", minLength: 1 },
                section: { type: "string" },
                actor: { type: "string" }
            },
            ["id", "text"]
        ),
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
            "Move a card to another protocol status while enforcing claim and verification semantics.",
        inputSchema: schema(
            {
                id: { type: "string", minLength: 1 },
                status: { type: "string", minLength: 1 },
                actor: { type: "string" },
                scope: STRING_ARRAY,
                expectedRevision: { type: "string" }
            },
            ["id", "status"]
        ),
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
            "Patch allowed card metadata using optimistic concurrency. Use expectedRevision whenever the card was read earlier.",
        inputSchema: schema(
            {
                id: { type: "string", minLength: 1 },
                changes: { type: "object", additionalProperties: true },
                expectedRevision: { type: "string" }
            },
            ["id", "changes"]
        ),
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
        description: "Move a closed card to the canonical archive directory.",
        inputSchema: schema(
            {
                id: { type: "string", minLength: 1 },
                expectedRevision: { type: "string" }
            },
            ["id"]
        ),
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
        description: "Move an archived card back into the live backlog.",
        inputSchema: schema(
            {
                id: { type: "string", minLength: 1 },
                status: { type: "string" },
                expectedRevision: { type: "string" }
            },
            ["id"]
        ),
        annotations: annotations(),
        readOnly: false,
        async execute(args, context) {
            ensureMutable(context);
            const result = await reopenCard(context.workspace, requiredString(args.id, "id"), {
                status: optionalString(args.status) || "backlog",
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
                title: { type: "string", minLength: 1 },
                kind: { type: "string" },
                status: { type: "string" },
                folder: { type: "string" },
                owners: STRING_ARRAY,
                related: STRING_ARRAY,
                supersedes: STRING_ARRAY,
                scope: STRING_ARRAY,
                tags: STRING_ARRAY,
                source: { type: "string" },
                review_after: { type: "string" },
                body: { type: "string" }
            },
            ["title"]
        ),
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
                id: { type: "string", minLength: 1 },
                folder: { type: "string" },
                expectedRevision: { type: "string" }
            },
            ["id", "folder"]
        ),
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
            "Patch a managed document using optimistic concurrency. Indexed repository docs are intentionally read-only through this tool.",
        inputSchema: schema(
            {
                id: { type: "string", minLength: 1 },
                changes: { type: "object", additionalProperties: true },
                expectedRevision: { type: "string" }
            },
            ["id", "changes"]
        ),
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
            "Create an atomic unreleased changelog fragment and relate it to cards, decisions or other records.",
        inputSchema: schema(
            {
                title: { type: "string", minLength: 1 },
                type: { type: "string" },
                area: { type: "string" },
                visibility: { type: "string" },
                cards: STRING_ARRAY,
                issues: STRING_ARRAY,
                decisions: STRING_ARRAY,
                related: STRING_ARRAY,
                tags: STRING_ARRAY,
                body: { type: "string" }
            },
            ["title"]
        ),
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
        description: "Patch an unreleased changelog fragment using optimistic concurrency.",
        inputSchema: schema(
            {
                id: { type: "string", minLength: 1 },
                changes: { type: "object", additionalProperties: true },
                expectedRevision: { type: "string" }
            },
            ["id", "changes"]
        ),
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
        description: "Render selected unreleased fragments without mutating the repository.",
        inputSchema: schema({
            fragmentIds: STRING_ARRAY,
            visibility: { type: "string" }
        }),
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
            "Consume selected unreleased fragments and create a canonical release record. This moves fragment files into the release directory.",
        inputSchema: schema(
            {
                version: { type: "string", minLength: 1 },
                title: { type: "string" },
                date: { type: "string" },
                fragmentIds: STRING_ARRAY,
                visibility: { type: "string" },
                commit: { type: "string" },
                tags: STRING_ARRAY,
                body: { type: "string" }
            },
            ["version"]
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
            "Create a typed learning, decision, incident, convention or temporary context record.",
        inputSchema: schema(
            {
                collection: {
                    type: "string",
                    enum: ["learnings", "decisions", "incidents", "conventions", "context"]
                },
                title: { type: "string", minLength: 1 },
                status: { type: "string" },
                category: { type: "string" },
                confidence: { type: "string" },
                occurrences: { type: "integer", minimum: 0 },
                severity: { type: "string" },
                started_at: { type: "string" },
                resolved_at: { type: "string" },
                expires: { type: "string" },
                review_after: { type: "string" },
                deciders: STRING_ARRAY,
                related: STRING_ARRAY,
                supersedes: STRING_ARRAY,
                graduated_to: STRING_ARRAY,
                corrective_actions: STRING_ARRAY,
                scope: STRING_ARRAY,
                owners: STRING_ARRAY,
                tags: STRING_ARRAY,
                body: { type: "string" }
            },
            ["collection", "title"]
        ),
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
        description: "Patch a durable memory record using optimistic concurrency.",
        inputSchema: schema(
            {
                id: { type: "string", minLength: 1 },
                changes: { type: "object", additionalProperties: true },
                expectedRevision: { type: "string" }
            },
            ["id", "changes"]
        ),
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
            "Mark a learning as graduated and link it to the convention, decision or documentation that now carries the durable rule.",
        inputSchema: schema(
            {
                id: { type: "string", minLength: 1 },
                targets: STRING_ARRAY,
                expectedRevision: { type: "string" }
            },
            ["id", "targets"]
        ),
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
            "Supersede one memory record with another and update both sides atomically.",
        inputSchema: schema(
            {
                id: { type: "string", minLength: 1 },
                replacementId: { type: "string", minLength: 1 },
                expectedRevision: { type: "string" }
            },
            ["id", "replacementId"]
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
