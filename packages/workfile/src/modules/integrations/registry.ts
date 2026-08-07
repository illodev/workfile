import { ValidationError } from "../../core/errors.js";
import type {
    ProjectDiagnostic,
    ProjectIndex,
    ProjectIntegration,
    ProjectWorkspace,
    SemanticSearchProvider
} from "../../types.js";

/**
 * How long a declared `healthCheck` may take before `doctor` answers without it.
 *
 * Generous on purpose: a health check that reaches a model or a socket is the
 * kind worth declaring, and this is not a performance budget. It exists so that
 * a hook which never settles produces a named finding in ten seconds instead of
 * a CI job that dies at its own timeout with nothing to read.
 *
 * The bound is real for an awaited hang and worthless against a synchronous
 * spin: a hook runs on `doctor`'s own event loop, so `while (true) {}` starves
 * the timer too. Bounding that would mean running the hook in a worker, which is
 * a different feature — see ADR-0019.
 */
const HEALTH_CHECK_TIMEOUT_MS = 10_000;

const HEALTH_CHECK_TIMED_OUT = Symbol("health-check-timed-out");

const DIAGNOSTIC_SEVERITIES = new Set(["error", "warning", "info"]);

function validId(value) {
    return /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(String(value || ""));
}

function describe(value: unknown) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
}

/**
 * Split what a `healthCheck` returned into diagnostics `doctor` can count and
 * entries it cannot.
 *
 * `runDoctor` derives `counts` and `ok` from `issue.severity` and sorts on it,
 * so an entry carrying anything else does not merely look wrong: it lands in no
 * bucket, leaves `ok` true, and makes the comparator sort on NaN. That is the
 * failure this guards — an integration cannot hand back a value that decides
 * whether the repository passes.
 */
function partitionDiagnostics(raw: unknown[]) {
    const issues: ProjectDiagnostic[] = [];
    const rejected: string[] = [];
    raw.forEach((entry, position) => {
        const at = `[${position}]`;
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            rejected.push(`${at} is ${describe(entry)}, not a diagnostic object`);
            return;
        }
        const diagnostic = entry as Record<string, unknown>;
        const problems: string[] = [];
        if (!DIAGNOSTIC_SEVERITIES.has(String(diagnostic.severity))) {
            problems.push(
                `severity ${JSON.stringify(diagnostic.severity)} is not error, warning or info`
            );
        }
        if (typeof diagnostic.code !== "string" || !diagnostic.code) {
            problems.push("code is not a non-empty string");
        }
        if (typeof diagnostic.message !== "string" || !diagnostic.message) {
            problems.push("message is not a non-empty string");
        }
        if (problems.length) {
            rejected.push(`${at} ${problems.join("; ")}`);
            return;
        }
        issues.push(diagnostic as unknown as ProjectDiagnostic);
    });
    return { issues, rejected };
}

/**
 * Call one declared `healthCheck` and turn whatever it does into diagnostics.
 *
 * The repository declaring the hook already runs its own code on every command
 * — `loadWorkspace` `import()`s `project.config.mjs` — so this is not a
 * sandbox and does not pretend to be one. What it does is stop a hook from
 * speaking for `doctor`: a throw, a hang or a malformed diagnostic becomes a
 * finding *about the integration*, attributed to it by id, instead of taking
 * down the one command the generated CI workflow exists to run.
 *
 * Each failure is an error rather than a warning because `doctor` is a gate. A
 * declared check that could not answer is not a pass, and there is no way to
 * tell what a malformed entry was trying to say.
 */
async function healthCheckDiagnostics(
    integration: ProjectIntegration,
    context: { workspace: ProjectWorkspace; index: ProjectIndex },
    timeoutMs: number
): Promise<ProjectDiagnostic[] | null> {
    const details = { integration: integration.id };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let report: unknown;
    try {
        const settled = Promise.resolve(integration.healthCheck!(context));
        // A hook that rejects after the race is already decided still needs a
        // handler here, or Node takes the process down for an unhandled
        // rejection well after `doctor` has printed its report.
        settled.catch(() => {});
        report = await Promise.race([
            settled,
            // Deliberately not `unref`ed. An unreferenced timer lets Node exit
            // once the hung hook is the only thing left, so `workfile doctor`
            // would die silently having printed no report at all — the failure
            // this bound exists to replace. `clearTimeout` in the `finally` is
            // what keeps a fast hook from holding the process for ten seconds.
            new Promise((resolve) => {
                timer = setTimeout(
                    () => resolve(HEALTH_CHECK_TIMED_OUT),
                    timeoutMs
                );
            })
        ]);
    } catch (error) {
        return [
            {
                severity: "error",
                code: "integration-health-check-failed",
                message:
                    `Integration ${integration.id} declares a healthCheck that threw: ` +
                    `${(error as Error)?.message || String(error)}. Its findings are missing from this report.`,
                details: {
                    ...details,
                    error: (error as Error)?.message || String(error)
                }
            }
        ];
    } finally {
        clearTimeout(timer);
    }
    if (report === HEALTH_CHECK_TIMED_OUT) {
        return [
            {
                severity: "error",
                code: "integration-health-check-timeout",
                message:
                    `Integration ${integration.id} declares a healthCheck that did not settle within ` +
                    `${timeoutMs}ms. Its findings are missing from this report.`,
                details: { ...details, timeoutMs }
            }
        ];
    }
    // Nothing to say is a valid answer, and stays indistinguishable from an
    // integration that declares no hook at all.
    if (!report) return null;
    const raw = Array.isArray(report)
        ? report
        : (report as { issues?: unknown }).issues;
    if (!Array.isArray(raw)) {
        return [
            {
                severity: "error",
                code: "integration-health-check-invalid",
                message:
                    `Integration ${integration.id} declares a healthCheck that returned ` +
                    `${describe(report)}, not an array of diagnostics or an object with an \`issues\` array.`,
                details: { ...details, returned: describe(report) }
            }
        ];
    }
    const { issues, rejected } = partitionDiagnostics(raw);
    if (rejected.length) {
        issues.push({
            severity: "error",
            code: "integration-health-check-invalid",
            message:
                `Integration ${integration.id} returned ${rejected.length} of ${raw.length} ` +
                `diagnostics that could not be counted, so they were dropped: ${rejected.join(", ")}.`,
            details: { ...details, rejected, returned: raw.length }
        });
    }
    return issues;
}

export function defineProjectIntegration(
    definition: ProjectIntegration
): Readonly<ProjectIntegration> {
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
        throw new ValidationError(
            "INTEGRATION_DEFINITION_INVALID",
            "Project integrations must be objects."
        );
    }
    if (!validId(definition.id)) {
        throw new ValidationError(
            "INTEGRATION_ID_INVALID",
            "Integration ids must use lowercase letters, digits, dots, underscores or hyphens.",
            { id: definition.id }
        );
    }
    if (
        definition.semanticSearchProvider &&
        typeof definition.semanticSearchProvider.search !== "function"
    ) {
        throw new ValidationError(
            "INTEGRATION_SEARCH_PROVIDER_INVALID",
            `Integration ${definition.id} has an invalid semantic search provider.`
        );
    }
    if (
        definition.healthCheck &&
        typeof definition.healthCheck !== "function"
    ) {
        throw new ValidationError(
            "INTEGRATION_HEALTH_CHECK_INVALID",
            `Integration ${definition.id} healthCheck must be a function.`
        );
    }
    return Object.freeze({
        title: definition.id,
        description: "",
        ...definition
    });
}

export interface ProjectIntegrationRegistry {
    list(): ProjectIntegration[];
    get(id: string): ProjectIntegration | null;
    semanticSearchProvider(preferredId?: string): SemanticSearchProvider | null;
    /**
     * `module`, not `integration`: the shape every other `doctor` report has,
     * which is what the returned value has always actually carried.
     */
    healthReports(
        workspace: ProjectWorkspace,
        index: ProjectIndex
    ): Promise<Array<{ module: string; issues: ProjectDiagnostic[] }>>;
}

export interface IntegrationRegistryOptions {
    /**
     * Override the bound on a declared `healthCheck`. Exists so the bound is
     * testable in milliseconds rather than only at its ten-second default —
     * `runDoctor` does not pass it, and an untested timeout is a timeout that
     * regresses quietly.
     */
    healthCheckTimeoutMs?: number;
}

export function createIntegrationRegistry(
    integrations: ProjectIntegration[] = [],
    options: IntegrationRegistryOptions = {}
): Readonly<ProjectIntegrationRegistry> {
    const healthCheckTimeoutMs =
        options.healthCheckTimeoutMs ?? HEALTH_CHECK_TIMEOUT_MS;
    const ordered = [];
    const byId = new Map();
    for (const candidate of integrations) {
        const integration = defineProjectIntegration(candidate);
        if (byId.has(integration.id)) {
            throw new ValidationError(
                "INTEGRATION_ID_DUPLICATE",
                `Duplicate integration id: ${integration.id}`
            );
        }
        byId.set(integration.id, integration);
        ordered.push(integration);
    }
    ordered.sort((left, right) => left.id.localeCompare(right.id));
    return Object.freeze({
        list() {
            return ordered.map(({ semanticSearchProvider, healthCheck, ...item }) => ({
                ...item,
                capabilities: {
                    semanticSearch: Boolean(semanticSearchProvider),
                    health: Boolean(healthCheck)
                }
            }));
        },
        get(id) {
            return byId.get(id) || null;
        },
        semanticSearchProvider(preferredId) {
            if (preferredId) {
                return byId.get(preferredId)?.semanticSearchProvider || null;
            }
            return (
                ordered.find((integration) => integration.semanticSearchProvider)
                    ?.semanticSearchProvider || null
            );
        },
        async healthReports(workspace, index) {
            const reports = [];
            for (const integration of ordered) {
                if (!integration.healthCheck) continue;
                const issues = await healthCheckDiagnostics(
                    integration,
                    { workspace, index },
                    healthCheckTimeoutMs
                );
                if (!issues) continue;
                reports.push({
                    module: `integration:${integration.id}`,
                    issues
                });
            }
            return reports;
        }
    });
}
