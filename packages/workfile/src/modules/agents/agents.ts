import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { ValidationError } from "../../core/errors.js";
import { ensureWritable } from "../../core/guards.js";
import {
    inspectManagedFile,
    relativeLabel,
    renderManagedBlock,
    syncManagedFile
} from "../generated/managed-files.js";
import {
    buildProjectIndex,
    findProjectRecord,
    searchProjectRecords
} from "../records/public.js";
import type { ProjectRecord } from "../../types.js";

const PACKAGE_VERSION = JSON.parse(
    await readFile(new URL("../../../../package.json", import.meta.url), "utf8")
).version;

export const AGENT_TARGETS = Object.freeze({
    "agents-md": {
        path: "AGENTS.md",
        kind: "adapter-agents-md",
        title: "AGENTS.md",
        mode: "append"
    },
    claude: {
        path: "CLAUDE.md",
        kind: "adapter-claude",
        title: "Claude Code",
        mode: "append"
    },
    cursor: {
        path: ".cursor/rules/workfile.mdc",
        kind: "adapter-cursor",
        title: "Cursor",
        mode: "dedicated",
        preamble:
            "---\ndescription: Repository Workfile instructions\nalwaysApply: true\n---"
    },
    copilot: {
        path: ".github/copilot-instructions.md",
        kind: "adapter-copilot",
        title: "GitHub Copilot",
        mode: "append"
    }
});

const WORKFLOW_FILES = Object.freeze([
    ["start-work.md", "start-work"],
    ["finish-work.md", "finish-work"],
    ["discovered-work.md", "discovered-work"],
    ["record-knowledge.md", "record-knowledge"]
]);


function q(value) {
    return `\`${value}\``;
}

function canonicalBody(workspace) {
    const areas = workspace.config.cards.areas.map(q).join(", ");
    return `# Repository operating protocol

This repository uses **Repository Workfile schema v${workspace.schema.schemaVersion}**. Repository Markdown files are canonical. The UI, CLI and every agent adapter must use the same services and rules.

## Before working

1. Search related work and knowledge with \`${workspace.cli} search\`.
2. Read the card and its relationship neighborhood before substantial code changes.
3. Claim the card before touching its scope: \`${workspace.cli} card claim ID --scope path,path\`. Your identity resolves on its own and \`${workspace.cli} agents whoami\` prints it. Pass \`--actor\` only to claim on someone else's behalf: an actor invented by hand does not match the one the edit guard sees.
4. Inspect active claims and overlapping scopes. Do not overwrite another actor's work.
5. Load the smallest relevant context; do not inject all workfile memory into every prompt.

## While working

- Keep the card current when scope, state or blockers change.
- Create cards in the same session for actionable pending work you discover.
- Record decisions, incidents, conventions or learnings when they change future behavior.
- Add a changelog fragment for user-visible changes or whenever project policy requires one.
- Prefer the CLI or an official adapter for mutations; do not hand-edit frontmatter except in an emergency.
- Never store credentials, tokens or unnecessary sensitive data in Work, Docs, History or Memory.

## Work states

- \`backlog\`: identified without a commitment.
- \`next\`: prioritized for the next batch.
- \`doing\`: actively worked and claimed.
- \`review\`: implementation finished, awaiting verification, deployment or approval.
- \`blocked\`: externally blocked; record why.
- \`deferred\`: deliberately postponed; record why.
- \`done\`: verified in an environment where it actually runs. A commit or merge is insufficient.
- \`discarded\`: will not be done; record why.

## Finishing

1. Run relevant tests and verification.
2. Run \`${workspace.cli} doctor\`.
3. Keep the card in \`review\` if verification or deployment is pending; use \`done\` only with real evidence.
4. Release the claim when active work stops.
5. Record durable knowledge and changelog fragments when appropriate.

## Project contracts

- Valid areas: ${areas}.
- Maximum card hierarchy depth: ${workspace.config.cards.maxHierarchyDepth} levels below the root.
- Claims are operationally stale after ${workspace.config.cards.claimLeaseHours} hours, but must not be ignored without reviewing context.
- Canonical instructions: \`${relativeLabel(workspace.root, workspace.paths.agentProtocol)}\`.
- Workflows: \`${relativeLabel(workspace.root, workspace.paths.agentWorkflows)}/*.md\`.

## Essential commands

\`${workspace.cli} next\`  
\`${workspace.cli} search "query"\`  
\`${workspace.cli} agents context --card T-0001\`  
\`${workspace.cli} card show T-0001 --json\`  
\`${workspace.cli} card claim T-0001 --scope apps/api\`  
\`${workspace.cli} card transition T-0001 review\`  
\`${workspace.cli} changelog add --title "Change" --type changed --area api\`  
\`${workspace.cli} memory add decision --title "Decision" --status accepted\`  
\`${workspace.cli} doctor\`
`;
}

function workflowBody(workspace, workflow) {
    const content = {
        "start-work": `# Start work

1. Run \`${workspace.cli} agents context --card <ID>\`.
2. Read the card plus relevant docs, decisions, conventions and incidents.
3. Check active claims and overlapping scopes.
4. Claim the card: \`${workspace.cli} card claim <ID> --scope path,path\`. Do not invent an actor.
5. Move to \`doing\` only when work actually begins.
6. Confirm acceptance criteria and the verification plan before editing code.`,
        "finish-work": `# Finish work

1. Run relevant tests, typecheck, lint and verification.
2. Update notes and acceptance criteria with verifiable evidence.
3. Add a changelog fragment when required.
4. Record durable decisions, incidents or learnings.
5. Run \`${workspace.cli} doctor\`.
6. Use \`review\` when deployment or runtime verification is still pending.
7. Use \`done\` only after verification in the appropriate environment.
8. Release the claim when active work stops.`,
        "discovered-work": `# Discovered work

When actionable pending work appears during another task:

1. Do not leave it only in comments, agent memory or an informal TODO.
2. Create a card in the same session with enough context and a source reference.
3. Relate it through \`parent\`, \`depends\`, \`source\` or record IDs.
4. Use \`idea\` only for unvalidated proposals; use a committed work type when a decision already exists.
5. Do not change owner priorities without explicit authorization.`,
        "record-knowledge": `# Record knowledge

Choose the record first, then the collection:

- **Card note**: evidence about *this* card. It dies with the card.
- **Memory**: it outlives the card and changes how future work is done.
- **Doc**: reference material somebody will read start to finish.

When two fit, prefer memory: a note nobody will search again is the cheapest
thing to write and the easiest to lose.

Choose the most specific collection:

- \`learning\`: reusable observation whose evidence can accumulate.
- \`decision\`: architecture, product or operational choice with alternatives and consequences.
- \`incident\`: operational event with impact, timing and corrective actions.
- \`convention\`: durable rule humans and agents must follow.
- \`context\`: useful but temporary state with expiry or review.

Avoid duplicates: search first. Link cards and docs. Never store secrets. Graduate or supersede records as knowledge evolves.`
    };
    return content[workflow];
}

function adapterBody(workspace, target) {
    const canonical = relativeLabel(workspace.root, workspace.paths.agentProtocol);
    const header = `# Workfile for ${target.title}`;
    const body = `${header}

Before substantial changes, read \`${canonical}\` and the relevant workflow under \`${relativeLabel(workspace.root, workspace.paths.agentWorkflows)}\`.

Critical rules:

- Search context with \`${workspace.cli} search\` or \`${workspace.cli} agents context\`.
- Claim cards before modifying their scope.
- Use CLI/MCP for protocol mutations.
- \`review\` means verification is pending; \`done\` requires runtime evidence.
- Create cards for discovered pending work and record durable knowledge.
- Run \`${workspace.cli} doctor\` before finishing.`;
    return body;
}

function targetEntries(workspace, selectedTargets) {
    const targets = selectedTargets || workspace.config.agents.targets;
    return targets.map((id) => {
        const definition = AGENT_TARGETS[id];
        if (!definition) {
            throw new ValidationError(
                "AGENT_TARGET_UNSUPPORTED",
                `Unsupported agent target: ${id}`,
                { target: id, supported: Object.keys(AGENT_TARGETS) }
            );
        }
        return {
            id,
            definition,
            path: resolve(workspace.root, definition.path),
            label: definition.path,
            block: renderManagedBlock({
                kind: definition.kind,
                version: PACKAGE_VERSION,
                body: adapterBody(workspace, definition)
            })
        };
    });
}

export function renderAgentFiles(workspace, options: any = {}) {
    const canonicalLabel = relativeLabel(workspace.root, workspace.paths.agentProtocol);
    const entries = [
        {
            id: "protocol",
            path: workspace.paths.agentProtocol,
            label: canonicalLabel,
            requireMarker: false,
            block: renderManagedBlock({
                kind: "canonical-agent-protocol",
                version: PACKAGE_VERSION,
                body: canonicalBody(workspace)
            })
        },
        ...WORKFLOW_FILES.map(([file, workflow]) => ({
            id: workflow,
            path: join(workspace.paths.agentWorkflows, file),
            label: relativeLabel(workspace.root, join(workspace.paths.agentWorkflows, file)),
            requireMarker: true,
            block: renderManagedBlock({
                kind: `workflow-${workflow}`,
                version: PACKAGE_VERSION,
                body: workflowBody(workspace, workflow)
            })
        })),
        ...targetEntries(workspace, options.targets).map((entry) => ({
            ...entry,
            requireMarker: entry.definition.mode === "dedicated",
            preamble: entry.definition.preamble || ""
        }))
    ];
    return entries;
}

export async function syncAgentInstructions(workspace, options: any = {}) {
    if (!options.dryRun) ensureWritable(workspace);
    const files = renderAgentFiles(workspace, options);
    const results = [];
    for (const file of files) {
        results.push(
            await syncManagedFile({
                ...file,
                force: Boolean(options.force),
                dryRun: Boolean(options.dryRun)
            })
        );
    }
    return {
        version: PACKAGE_VERSION,
        targets: options.targets || workspace.config.agents.targets,
        changed: results.filter((item) => item.status !== "unchanged").length,
        files: results
    };
}

export async function checkAgentInstructions(workspace, options: any = {}) {
    const files = renderAgentFiles(workspace, options);
    const results = [];
    for (const file of files) {
        results.push(
            await inspectManagedFile({
                path: file.path,
                block: file.block,
                label: file.label
            })
        );
    }
    const issues = results
        .filter((item) => item.status !== "current")
        .map((item) => ({
            severity: item.status === "stale" ? "warning" : "warning",
            code:
                item.status === "missing"
                    ? "agent-instructions-missing"
                    : item.status === "unmanaged"
                      ? "agent-instructions-unmanaged"
                      : "agent-instructions-stale",
            file: item.path,
            message:
                item.status === "missing"
                    ? `Generated agent instructions are missing: ${item.path}`
                    : item.status === "unmanaged"
                      ? `Generated agent instructions have no managed block: ${item.path}`
                      : `Generated agent instructions are stale: ${item.path}`,
            details: item
        }));
    return {
        ok: issues.length === 0,
        version: PACKAGE_VERSION,
        counts: {
            current: results.filter((item) => item.status === "current").length,
            stale: results.filter((item) => item.status === "stale").length,
            missing: results.filter((item) => item.status === "missing").length,
            unmanaged: results.filter((item) => item.status === "unmanaged").length
        },
        files: results,
        issues
    };
}

/**
 * Does this record's scope let it into the bundle?
 *
 * Three states, not two. A record that declares no scope is universal. A record
 * weighed against work whose scope is known is a comparison. A record weighed
 * against work whose scope is *unknown* — no focus card, or a focus card that
 * declares none — is neither, and answering "no" there is how a scoped record
 * disappeared from the command the protocol tells agents to run first. That is
 * the failure T-0080 fixed in the reachability dimension, surviving in this
 * one. Unknown includes, and the summary carries the scope so a reader can
 * discard it deliberately instead of never seeing it.
 */
function scopeMatches(recordScope, cardScope) {
    if (!recordScope?.length || !cardScope?.length) return true;
    return recordScope.some((left) =>
        cardScope.some(
            (right) =>
                left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)
        )
    );
}

function renderRecordSummary(record) {
    const metadata = [record.kind, record.collection, record.status, record.area]
        .filter(Boolean)
        .join(" · ");
    // On its own line: a scope is a list of paths, and folding it into the
    // metadata run turns a three-path card into an unreadable one.
    const scope = Array.isArray(record.scope) ? record.scope : record.scope ? [record.scope] : [];
    const heading = [metadata && `_${metadata}_`, scope.length && `_scope: ${scope.join(", ")}_`]
        .filter(Boolean)
        .join("\n");
    return `## ${record.id} — ${record.title}\n\n${heading ? `${heading}\n\n` : ""}${record.body || record.excerpt || ""}`.trim();
}

/**
 * What the card asks its own workspace for.
 *
 * Stripped to bare words on the way out: `parseQuery` reads `key:value` as a
 * filter and a leading `-` as a negation, and card titles carry both. A query
 * built out of prose has to arrive as prose or it silently becomes a filter
 * that matches nothing.
 *
 * The body is capped. Relevance comes from what the card is about, which the
 * title, area, tags and opening paragraphs carry; feeding a whole card in
 * makes every long card match everything.
 */
function relevanceQuery(focus) {
    return [
        focus.title,
        focus.area,
        ...(focus.tags || []),
        String(focus.body || focus.excerpt || "").slice(0, 600)
    ]
        .filter(Boolean)
        .join(" ")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .split(" ")
        .filter((word) => word.length > 1 && !STOPWORDS.has(word.toLowerCase()))
        .join(" ")
        .trim();
}

/**
 * Words carried by the query that say nothing about what a card is about.
 *
 * The search this ranks with does not remove them, and does not need to: a
 * human types the terms that matter. A query built from prose types all of
 * them, and `searchScore` awards a title hit 15 points whether the word is
 * "locomotion" or "the" — so "The render loop drops frames" and "Locomotion
 * uses root motion rather than velocity" matched each other on `the`, and
 * every card was relevant to every record again by a different route.
 *
 * English only, which is the whole surface since ADR-0012. The list is
 * deliberately short: a word that carries no subject, not a word that is
 * merely common. It is a heuristic and it is worth knowing it is one — two
 * records about genuinely different subjects that share an unusual ordinary
 * word will still meet.
 */
const STOPWORDS = new Set([
    "a", "about", "above", "after", "again", "against", "all", "an", "and",
    "any", "are", "as", "at", "be", "been", "before", "being", "below",
    "between", "both", "but", "by", "can", "did", "do", "does", "doing",
    "down", "during", "each", "few", "for", "from", "further", "had", "has",
    "have", "having", "how", "if", "in", "into", "is", "it", "its", "itself",
    "just", "more", "most", "no", "nor", "not", "now", "of", "off", "on",
    "once", "only", "or", "other", "our", "out", "over", "own", "rather",
    "same", "should", "so", "some", "such", "than", "that", "the", "their",
    "them", "then", "there", "these", "they", "this", "those", "through",
    "to", "too", "under", "until", "up", "very", "was", "we", "were", "what",
    "when", "where", "which", "while", "who", "why", "will", "with", "would",
    "you", "your"
]);

/**
 * Memory ranked against the focus card, by id, best first.
 *
 * `scopeMatches` was supposed to be doing this and could not: it returns true
 * whenever either side declares no scope, `memory add` sets none, and most
 * cards carry none either — so in an ordinary workspace the filter passed
 * everything and the only thing between a card and the whole of memory was the
 * record cap. Two unrelated cards received an identical bundle, which is what
 * DOC-0005 reported and what `protocol.md` line 12 tells agents not to do.
 *
 * Scored by the same search the CLI exposes rather than by a second notion of
 * relevance invented here: it already tokenizes without diacritics, weights
 * title over body, and — the part that matters — drops records that score
 * zero. A relevance rule that only works on annotated records would be the
 * same no-op with more code, because the annotation is what nobody fills in.
 */
function rankMemoryAgainst(index, focus) {
    const query = relevanceQuery(focus);
    if (!query) return null;
    const ranked = searchProjectRecords(index.records, query, {
        kinds: ["memory"],
        limit: index.records.length,
        view: "summary"
    });
    // Typed rather than inferred: `map` over a two-element array literal widens
    // to `(string | number)[]`, and the ranks then stop being numbers.
    return new Map<string, number>(
        ranked.records.map((record, at) => [record.id, at] as [string, number])
    );
}

export async function buildAgentContext(workspace, options: any = {}) {
    // This is the route an agent hits most, and it rebuilt the whole index to
    // produce a few hundred bytes. Callers that already hold one pass it in.
    const index = options.index || (await buildProjectIndex(workspace));
    const cardId = options.cardId || options.card;
    // Annotated because `null` alone infers `never`, and every property read
    // through the optional chain below then counts as an error the ratchet has
    // to carry. The bundle's own shape is the honest type here.
    let focus: ProjectRecord | null = null;
    if (cardId) {
        focus = findProjectRecord(index, cardId);
        if (!focus || focus.kind !== "card") {
            throw new ValidationError(
                "AGENT_CONTEXT_CARD_NOT_FOUND",
                `Agent context card not found: ${cardId}`,
                { cardId }
            );
        }
    }
    // Provenance, both ways, read off the field rather than off the graph edge.
    //
    // The edge cannot answer this. `classifiedReferences` collapses every
    // explicit frontmatter link to the single relation `reference`, so in the
    // index an origin is indistinguishable from a `related` or a `depends` —
    // the records already arrive through `direct` below, but nothing says which
    // of them this card came out of and which came out of it. The field says it
    // exactly, and in both directions: one read off the focus card, the other
    // off everything naming it.
    // Narrowed here rather than above: `focus.kind !== "card"` already threw,
    // but that guard sits inside `if (cardId)` and the union widens again on
    // the way out, so `origin` — a card-only field — is unreachable without it.
    const cameFrom = focus?.kind === "card" ? focus.origin || [] : [];
    const spawned = focus
        ? index.records
              .filter(
                  (record) =>
                      record.kind === "card" &&
                      (record.origin || []).includes(focus.id)
              )
              .map((record) => record.id)
              .sort()
        : [];
    const directIds = new Set([
        ...(focus?.outgoing || []).map((item) => item.id),
        ...(focus?.incoming || []).map((item) => item.id),
        ...cameFrom,
        ...spawned
    ]);
    const direct = index.records.filter((record) => directIds.has(record.id));
    // Draft is included deliberately. A convention that has been written down
    // but not yet promoted is still the house rule an agent is about to break,
    // and dropping it silently is how this repository's own CONV-0001 became
    // unreachable from the command the protocol tells agents to run first. The
    // rendered summary carries the status, so a draft still reads as a draft.
    const conventions = index.records.filter(
        (record) =>
            record.kind === "memory" &&
            record.collection === "conventions" &&
            ["active", "draft"].includes(record.status) &&
            scopeMatches(record.scope, focus?.scope)
    );
    // Decisions and learnings were reachable from no path at all, so every ADR
    // and LRN in a workspace was invisible to the bundle. A decision is exactly
    // the thing an agent must not silently contradict.
    const decisions = index.records.filter(
        (record) =>
            record.kind === "memory" &&
            record.collection === "decisions" &&
            record.status === "accepted" &&
            scopeMatches(record.scope, focus?.scope)
    );
    const learnings = index.records.filter(
        (record) =>
            record.kind === "memory" &&
            record.collection === "learnings" &&
            record.status !== "superseded" &&
            record.confidence !== "low" &&
            scopeMatches(record.scope, focus?.scope)
    );
    // With no card there is no focus and no direct links, so the session-start
    // bundle would open on durable knowledge alone. What a session needs to
    // know first is what is already in flight — including who is holding it.
    const inFlight = cardId
        ? []
        : index.records
              .filter(
                  (record) =>
                      record.kind === "card" &&
                      ["doing", "review"].includes(record.status)
              )
              .sort((left, right) =>
                  String(left.id).localeCompare(String(right.id))
              );
    const incidents = index.records.filter(
        (record) =>
            record.kind === "memory" &&
            record.collection === "incidents" &&
            ["open", "mitigated"].includes(record.status) &&
            scopeMatches(record.scope, focus?.scope)
    );
    const contexts = index.records.filter(
        (record) =>
            record.kind === "memory" &&
            record.collection === "context" &&
            record.status === "active" &&
            scopeMatches(record.scope, focus?.scope)
    );
    // No focus means no query, and a session-start bundle keeps every record it
    // qualified for: there is nothing yet for relevance to be relative to.
    const ranked = focus ? rankMemoryAgainst(index, focus) : null;
    // Normative records are exempt, informational ones are not, and the line
    // is whether the record constrains work it does not mention.
    //
    // A convention is a rule and a decision is a choice nothing may silently
    // contradict — both bind a card that shares no vocabulary with them.
    // CONV-0001, "protocol records are written in English", has nothing in
    // common with a card about a render loop and governs it completely, and
    // dropping it is how it became unreachable once already. Learnings,
    // incidents and context describe a subject instead, and a subject is
    // exactly what relevance can judge.
    //
    // The cost is honest and worth naming: a workspace with many accepted
    // decisions still gets all of them, bounded only by `--limit`. Ranking
    // decides which survive that cap, so the order is useful even when the
    // filter cannot help.
    const NORMATIVE = ["conventions", "decisions"];
    const relevant = (record) =>
        !ranked || NORMATIVE.includes(record.collection) || ranked.has(record.id);
    // `Infinity` rather than 0 for a record with no rank: without a query
    // nothing is ranked and the comparator has to be a no-op, and with one an
    // unranked record was already dropped by `relevant`.
    const rankOf = (record) => ranked?.get(record.id) ?? Number.POSITIVE_INFINITY;
    const byRank = (left, right) => rankOf(left) - rankOf(right);
    // Decisions lead because they are normative and always present; the rest
    // are ranked in among them by the sort below.
    const qualified = [...decisions, ...incidents, ...learnings, ...contexts];
    // Typed rather than inferred: an empty literal is `never[]`, so everything
    // read back off it — including `cut` below — has no properties at all.
    const prioritized: ProjectRecord[] = [];
    const seen = new Set();
    for (const record of [
        focus,
        ...direct,
        ...inFlight,
        ...conventions,
        // Ranked across the four collections rather than within each, so a
        // learning that is plainly about this card outranks a decision that
        // merely qualified. Direct relations are already above this line and
        // never compete: a record the card names is in the bundle whatever it
        // scores.
        ...qualified.filter(relevant).sort(byRank)
    ]) {
        if (!record || seen.has(record.id)) continue;
        seen.add(record.id);
        prioritized.push(record);
    }
    // Measured against what actually got in, not against what relevance
    // rejected: a record the card names explicitly is admitted above this by
    // `direct`, and counting it as left out reported a record the bundle was
    // carrying.
    const dropped = qualified.filter((record) => !seen.has(record.id));
    const maxRecords = Math.max(1, Math.min(50, Number(options.limit || 20)));
    const records = prioritized.slice(0, maxRecords);
    const cut = prioritized.slice(maxRecords);
    const markdown = [
        `# Agent context${focus ? ` — ${focus.id}` : ""}`,
        "",
        `Minimal context derived from the canonical index. It does not replace reading source files when detail is needed.`,
        "",
        // Two lines, not a section. The bundle is budgeted, and the records
        // themselves follow immediately below — this only has to say which way
        // provenance runs between them.
        ...(cameFrom.length ? [`**Came out of**: ${cameFrom.join(", ")}`] : []),
        ...(spawned.length ? [`**Spawned**: ${spawned.join(", ")}`] : []),
        ...(cameFrom.length || spawned.length ? [""] : []),
        ...records.flatMap((record) => [renderRecordSummary(record), ""]),
        // A bundle that silently leaves records out reads exactly like a
        // workspace that has none, and the agent has no way to tell which it is
        // looking at. It says so, and says what reaches the rest.
        ...(dropped.length || cut.length
            ? [
                  `---`,
                  "",
                  `**Left out**: ${[
                      dropped.length ? `${dropped.length} below the relevance threshold for this card` : null,
                      cut.length ? `${cut.length} beyond \`--limit ${maxRecords}\`` : null
                  ]
                      .filter(Boolean)
                      .join(", ")}. \`${workspace.cli} search "query"\` reaches every record; \`--limit\` raises the ceiling.`
              ]
            : [])
    ]
        .join("\n")
        .trimEnd();
    return {
        focus: focus?.id || null,
        provenance: focus ? { origin: cameFrom, spawned } : null,
        generatedAt: new Date().toISOString(),
        truncated: prioritized.length > records.length,
        totalAvailable: prioritized.length,
        // Kept separate from `truncated` rather than folded into it. The two
        // are different questions — "the cap dropped relations" against "this
        // card is not what these records are about" — and T-0147 is open on
        // what happens when one field carries two meanings.
        omitted: {
            relevance: dropped.map((record) => record.id),
            limit: cut.map((record) => record.id)
        },
        records,
        markdown
    };
}
