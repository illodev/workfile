import { ValidationError } from "../../core/errors.js";
import type {
    ProjectIndex,
    ProjectIntegration,
    ProjectWorkspace,
    SemanticSearchProvider
} from "../../types.js";

function validId(value) {
    return /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(String(value || ""));
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
    healthReports(
        workspace: ProjectWorkspace,
        index: ProjectIndex
    ): Promise<Array<{ integration: string; issues: unknown[] }>>;
}

export function createIntegrationRegistry(
    integrations: ProjectIntegration[] = []
): Readonly<ProjectIntegrationRegistry> {
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
                const report = await integration.healthCheck({ workspace, index });
                if (!report) continue;
                reports.push({
                    module: `integration:${integration.id}`,
                    issues: Array.isArray(report) ? report : report.issues || []
                });
            }
            return reports;
        }
    });
}
