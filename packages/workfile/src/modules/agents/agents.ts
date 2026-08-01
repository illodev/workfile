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
import { buildProjectIndex, findProjectRecord } from "../records/public.js";
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

function spanish(workspace) {
    return String(workspace.config.language || "en").toLowerCase().startsWith("es");
}

function q(value) {
    return `\`${value}\``;
}

function canonicalBody(workspace) {
    const isEs = spanish(workspace);
    const areas = workspace.config.cards.areas.map(q).join(", ");
    if (isEs) {
        return `# Protocolo operativo del repositorio

Este repositorio usa **Repository Workfile schema v${workspace.schema.schemaVersion}**. Los archivos Markdown del repositorio son la fuente de verdad. La UI, el CLI y cualquier adaptador de agente deben usar los mismos servicios y reglas.

## Antes de trabajar

1. Busca el trabajo y el conocimiento relacionado con \`${workspace.cli} search\`.
2. Abre la tarjeta y sus relaciones antes de modificar código sustancial.
3. Reclama la tarjeta antes de tocar su scope: \`${workspace.cli} card claim ID --actor ACTOR --scope ruta,ruta\`.
4. Revisa claims activos y solapamientos de scope. No sobrescribas el trabajo de otro actor.
5. Carga solo el contexto necesario; evita inyectar toda la memoria del proyecto.

## Durante el trabajo

- Mantén la tarjeta actualizada cuando cambie el alcance, el estado o aparezca un bloqueo.
- Crea tarjetas en la misma sesión para trabajo pendiente accionable descubierto.
- Registra decisiones, incidentes, convenciones o aprendizajes cuando cambien el comportamiento futuro.
- Añade un fragmento de changelog para cambios visibles o cuando lo exija la política del proyecto.
- Usa el CLI o un adaptador oficial para mutaciones; no edites frontmatter manualmente salvo emergencia.
- No guardes credenciales, tokens ni datos sensibles innecesarios en Cards, Docs, History o Memory.

## Estados de Work

- \`backlog\`: identificado sin compromiso.
- \`next\`: priorizado para el siguiente lote.
- \`doing\`: trabajo activo y reclamado.
- \`review\`: implementación terminada, pendiente de verificación, despliegue o aprobación.
- \`blocked\`: bloqueado externamente; documenta la causa.
- \`deferred\`: aplazado deliberadamente; documenta el motivo.
- \`done\`: verificado en un entorno donde realmente se ejecuta. Un commit o merge no basta.
- \`discarded\`: no se hará; documenta el motivo.

## Al terminar

1. Ejecuta las pruebas y verificaciones relevantes.
2. Ejecuta \`${workspace.cli} doctor\`.
3. Deja la tarjeta en \`review\` si falta verificar o desplegar; usa \`done\` solo con evidencia real.
4. Libera el claim cuando el trabajo activo se detenga.
5. Registra conocimiento durable y changelog cuando corresponda.

## Contratos del proyecto

- Áreas válidas: ${areas}.
- La jerarquía máxima de tarjetas es ${workspace.config.cards.maxHierarchyDepth} niveles por debajo de la raíz.
- Los claims caducan operativamente tras ${workspace.config.cards.claimLeaseHours} horas, pero no deben ignorarse sin revisar contexto.
- Instrucciones canónicas: \`${relativeLabel(workspace.root, workspace.paths.agentProtocol)}\`.
- Workflows: \`${relativeLabel(workspace.root, workspace.paths.agentWorkflows)}/*.md\`.

## Comandos esenciales

\`${workspace.cli} next\`  
\`${workspace.cli} search "consulta"\`  
\`${workspace.cli} agents context --card T-0001\`  
\`${workspace.cli} card show T-0001 --json\`  
\`${workspace.cli} card claim T-0001 --actor session-id --scope apps/api\`  
\`${workspace.cli} card transition T-0001 review --actor session-id\`  
\`${workspace.cli} changelog add --title "Cambio" --type changed --area api\`  
\`${workspace.cli} memory add decision --title "Decisión" --status accepted\`  
\`${workspace.cli} doctor\`
`;
    }
    return `# Repository operating protocol

This repository uses **Repository Workfile schema v${workspace.schema.schemaVersion}**. Repository Markdown files are canonical. The UI, CLI and every agent adapter must use the same services and rules.

## Before working

1. Search related work and knowledge with \`${workspace.cli} search\`.
2. Read the card and its relationship neighborhood before substantial code changes.
3. Claim the card before touching its scope: \`${workspace.cli} card claim ID --actor ACTOR --scope path,path\`.
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
\`${workspace.cli} card claim T-0001 --actor session-id --scope apps/api\`  
\`${workspace.cli} card transition T-0001 review --actor session-id\`  
\`${workspace.cli} changelog add --title "Change" --type changed --area api\`  
\`${workspace.cli} memory add decision --title "Decision" --status accepted\`  
\`${workspace.cli} doctor\`
`;
}

function workflowBody(workspace, workflow) {
    const isEs = spanish(workspace);
    const content = {
        "start-work": isEs
            ? `# Empezar trabajo

1. Ejecuta \`${workspace.cli} agents context --card <ID>\`.
2. Lee la tarjeta, documentación, decisiones, convenciones e incidentes relevantes.
3. Comprueba claims y scopes solapados.
4. Reclama la tarjeta con un actor estable para la sesión.
5. Cambia a \`doing\` solo cuando el trabajo empiece realmente.
6. Confirma criterios de aceptación y plan de verificación antes de editar código.`
            : `# Start work

1. Run \`${workspace.cli} agents context --card <ID>\`.
2. Read the card plus relevant docs, decisions, conventions and incidents.
3. Check active claims and overlapping scopes.
4. Claim the card with a stable actor identifier for the session.
5. Move to \`doing\` only when work actually begins.
6. Confirm acceptance criteria and the verification plan before editing code.`,
        "finish-work": isEs
            ? `# Terminar trabajo

1. Ejecuta pruebas, typecheck, lint y verificaciones relevantes.
2. Actualiza notas y criterios de aceptación con evidencia verificable.
3. Añade fragmento de changelog si el cambio lo requiere.
4. Registra decisiones, incidentes o aprendizajes durables.
5. Ejecuta \`${workspace.cli} doctor\`.
6. Usa \`review\` si falta despliegue o verificación en ejecución.
7. Usa \`done\` únicamente cuando el resultado esté verificado en el entorno adecuado.
8. Libera el claim cuando deje de existir trabajo activo.`
            : `# Finish work

1. Run relevant tests, typecheck, lint and verification.
2. Update notes and acceptance criteria with verifiable evidence.
3. Add a changelog fragment when required.
4. Record durable decisions, incidents or learnings.
5. Run \`${workspace.cli} doctor\`.
6. Use \`review\` when deployment or runtime verification is still pending.
7. Use \`done\` only after verification in the appropriate environment.
8. Release the claim when active work stops.`,
        "discovered-work": isEs
            ? `# Trabajo descubierto

Cuando aparezca trabajo pendiente accionable durante otra tarea:

1. No lo escondas únicamente en comentarios, memoria del agente o un TODO informal.
2. Crea una tarjeta en la misma sesión con contexto suficiente y referencia a la fuente.
3. Relaciónala mediante \`parent\`, \`depends\`, \`source\` o menciones de IDs.
4. Usa \`idea\` solo para propuestas no validadas; usa un tipo de trabajo real cuando ya exista compromiso.
5. No cambies prioridades del propietario sin autorización explícita.`
            : `# Discovered work

When actionable pending work appears during another task:

1. Do not leave it only in comments, agent memory or an informal TODO.
2. Create a card in the same session with enough context and a source reference.
3. Relate it through \`parent\`, \`depends\`, \`source\` or record IDs.
4. Use \`idea\` only for unvalidated proposals; use a committed work type when a decision already exists.
5. Do not change owner priorities without explicit authorization.`,
        "record-knowledge": isEs
            ? `# Registrar conocimiento

Elige primero el registro y después la colección:

- **Nota de tarjeta**: evidencia sobre *esta* tarjeta. Muere con ella.
- **Memoria**: sobrevive a la tarjeta y cambia cómo se trabajará en el futuro.
- **Documento**: material de referencia que alguien leerá de principio a fin.

Cuando encajen dos, elige memoria: una nota que nadie volverá a buscar es lo más
barato de escribir y lo más fácil de perder.

Elige la colección más específica:

- \`learning\`: observación reutilizable aún basada en evidencia acumulable.
- \`decision\`: elección arquitectónica, de producto u operación con alternativas y consecuencias.
- \`incident\`: evento operativo con impacto, tiempos y acciones correctivas.
- \`convention\`: regla durable que humanos y agentes deben seguir.
- \`context\`: estado útil pero temporal, con expiración o revisión.

Evita duplicados: busca primero. Relaciona tarjetas y documentos. No guardes secretos. Gradúa o supersede registros cuando evolucione el conocimiento.`
            : `# Record knowledge

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
    const isEs = spanish(workspace);
    const canonical = relativeLabel(workspace.root, workspace.paths.agentProtocol);
    const header = isEs
        ? `# Workfile para ${target.title}`
        : `# Workfile for ${target.title}`;
    const body = isEs
        ? `${header}

Antes de realizar cambios sustanciales, lee \`${canonical}\` y el workflow aplicable en \`${relativeLabel(workspace.root, workspace.paths.agentWorkflows)}\`.

Reglas críticas:

- Busca contexto con \`${workspace.cli} search\` o \`${workspace.cli} agents context\`.
- Reclama las tarjetas antes de modificar su scope.
- Usa CLI/MCP para mutaciones del protocolo.
- \`review\` significa pendiente de verificación; \`done\` exige evidencia en ejecución.
- Crea tarjetas para trabajo pendiente descubierto y registra conocimiento durable.
- Ejecuta \`${workspace.cli} doctor\` antes de terminar.`
        : `${header}

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

function scopeMatches(recordScope, cardScope) {
    if (!recordScope?.length) return true;
    if (!cardScope?.length) return false;
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
    return `## ${record.id} — ${record.title}\n\n${metadata ? `_${metadata}_\n\n` : ""}${record.body || record.excerpt || ""}`.trim();
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
    const directIds = new Set([
        ...(focus?.outgoing || []).map((item) => item.id),
        ...(focus?.incoming || []).map((item) => item.id)
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
    // With no card there is no focus, and every scoped record fell away — which
    // left `totalAvailable: 0` for the session-start case. What a session
    // actually needs to know first is what is already in flight.
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
    const prioritized = [];
    const seen = new Set();
    for (const record of [
        focus,
        ...direct,
        ...inFlight,
        ...conventions,
        ...decisions,
        ...incidents,
        ...learnings,
        ...contexts
    ]) {
        if (!record || seen.has(record.id)) continue;
        seen.add(record.id);
        prioritized.push(record);
    }
    const maxRecords = Math.max(1, Math.min(50, Number(options.limit || 20)));
    const records = prioritized.slice(0, maxRecords);
    const isEs = spanish(workspace);
    const markdown = [
        `# ${isEs ? "Contexto de agente" : "Agent context"}${focus ? ` — ${focus.id}` : ""}`,
        "",
        isEs
            ? `Contexto mínimo derivado del índice canónico. No sustituye la lectura de los archivos cuando necesites detalle.`
            : `Minimal context derived from the canonical index. It does not replace reading source files when detail is needed.`,
        "",
        ...records.flatMap((record) => [renderRecordSummary(record), ""])
    ]
        .join("\n")
        .trimEnd();
    return {
        focus: focus?.id || null,
        generatedAt: new Date().toISOString(),
        truncated: prioritized.length > records.length,
        totalAvailable: prioritized.length,
        records,
        markdown
    };
}
