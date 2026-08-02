import {
    AGENT_TARGET_IDS,
    AXIS_NAME_RE,
    CARD_RESERVED_KEYS,
    CI_TARGET_IDS,
    DOC_LAYOUTS,
    MEMORY_DEFINITIONS,
    SCHEMA_VERSION
} from "./defaults.js";
import { ConfigError } from "../core/errors.js";
import type { ProjectConfig } from "../types.js";

interface ConfigIssue {
    severity: "error";
    code: string;
    path: string;
    message: string;
}

function issue(code: string, path: string, message: string): ConfigIssue {
    return { severity: "error", code, path, message };
}

function duplicateValues(values) {
    const seen = new Set();
    const duplicates = new Set();
    for (const value of values) {
        if (seen.has(value)) duplicates.add(value);
        seen.add(value);
    }
    return [...duplicates];
}

function validateStringList(
    issues: ConfigIssue[],
    values,
    path,
    { required = true }: any = {}
) {
    if (!Array.isArray(values)) {
        issues.push(issue("CONFIG_LIST_INVALID", path, `${path} must be an array`));
        return;
    }
    if (required && values.length === 0) {
        issues.push(issue("CONFIG_LIST_EMPTY", path, `${path} must not be empty`));
    }
    if (values.some((value) => typeof value !== "string" || !value.trim())) {
        issues.push(
            issue(
                "CONFIG_LIST_VALUE_INVALID",
                path,
                `${path} values must be non-empty strings`
            )
        );
    }
    const duplicates = duplicateValues(values);
    if (duplicates.length) {
        issues.push(
            issue(
                "CONFIG_LIST_VALUE_DUPLICATE",
                path,
                `Duplicate ${path} values: ${duplicates.join(", ")}`
            )
        );
    }
}

/**
 * `cards.axes`: a name mapped to the vocabulary its values must come from.
 *
 * An axis is only worth declaring for what declaring buys — a value outside the
 * list fails loudly instead of matching nothing. So the two ways to declare one
 * that buys nothing are refused here rather than at the write path: an empty
 * vocabulary validates everything, and a name a card already uses validates the
 * wrong field.
 */
function validateCardAxes(issues: ConfigIssue[], axes) {
    if (axes === undefined) return;
    if (!axes || typeof axes !== "object" || Array.isArray(axes)) {
        issues.push(
            issue(
                "CONFIG_CARDS_AXES_INVALID",
                "cards.axes",
                "cards.axes must be an object mapping an axis name to its values"
            )
        );
        return;
    }
    for (const [name, values] of Object.entries(axes)) {
        const path = `cards.axes.${name}`;
        if (!AXIS_NAME_RE.test(name)) {
            issues.push(
                issue(
                    "CONFIG_CARDS_AXIS_NAME_INVALID",
                    path,
                    `Axis name "${name}" must be lowercase letters, digits and underscores, and start with a letter`
                )
            );
        } else if (CARD_RESERVED_KEYS.includes(name as never)) {
            issues.push(
                issue(
                    "CONFIG_CARDS_AXIS_RESERVED",
                    path,
                    `Axis name "${name}" is already a card field; pick another name`
                )
            );
        }
        validateStringList(issues, values, path);
    }
}

function validatePrefix(issues: ConfigIssue[], value, path, code) {
    if (!/^[A-Z][A-Z0-9]{0,7}$/.test(String(value || ""))) {
        issues.push(
            issue(
                code,
                path,
                `${path} must be 1-8 uppercase letters or digits and start with a letter`
            )
        );
    }
}

export function validateProjectConfig(config: any) {
    const issues: ConfigIssue[] = [];
    if (config.schemaVersion !== SCHEMA_VERSION) {
        issues.push(
            issue(
                "CONFIG_SCHEMA_UNSUPPORTED",
                "schemaVersion",
                `Unsupported schemaVersion ${config.schemaVersion}; expected ${SCHEMA_VERSION}`
            )
        );
    }
    if (!config.name || !String(config.name).trim()) {
        issues.push(issue("CONFIG_NAME_REQUIRED", "name", "name must not be empty"));
    }
    if (!config.storage || typeof config.storage !== "object") {
        issues.push(
            issue("CONFIG_STORAGE_REQUIRED", "storage", "storage must be an object")
        );
    }

    if (!config.cards || typeof config.cards !== "object") {
        issues.push(issue("CONFIG_CARDS_REQUIRED", "cards", "cards must be an object"));
    } else {
        if (!Array.isArray(config.cards.areas) || config.cards.areas.length === 0) {
            issues.push(
                issue(
                    "CONFIG_CARDS_AREAS_REQUIRED",
                    "cards.areas",
                    "cards.areas must contain at least one area"
                )
            );
        } else {
            const invalid = config.cards.areas.filter(
                (area) => typeof area !== "string" || !area.trim()
            );
            if (invalid.length) {
                issues.push(
                    issue(
                        "CONFIG_CARDS_AREA_INVALID",
                        "cards.areas",
                        "cards.areas values must be non-empty strings"
                    )
                );
            }
            const duplicates = duplicateValues(config.cards.areas);
            if (duplicates.length) {
                issues.push(
                    issue(
                        "CONFIG_CARDS_AREA_DUPLICATE",
                        "cards.areas",
                        `Duplicate card areas: ${duplicates.join(", ")}`
                    )
                );
            }
        }
        validateCardAxes(issues, config.cards.axes);
        validatePrefix(
            issues,
            config.cards.idPrefix,
            "cards.idPrefix",
            "CONFIG_CARD_PREFIX_INVALID"
        );
        if (
            !Number.isInteger(config.cards.maxHierarchyDepth) ||
            config.cards.maxHierarchyDepth < 0 ||
            config.cards.maxHierarchyDepth > 10
        ) {
            issues.push(
                issue(
                    "CONFIG_HIERARCHY_DEPTH_INVALID",
                    "cards.maxHierarchyDepth",
                    "cards.maxHierarchyDepth must be an integer between 0 and 10"
                )
            );
        }
        if (
            !Number.isFinite(config.cards.claimLeaseHours) ||
            config.cards.claimLeaseHours <= 0
        ) {
            issues.push(
                issue(
                    "CONFIG_CLAIM_LEASE_INVALID",
                    "cards.claimLeaseHours",
                    "cards.claimLeaseHours must be greater than zero"
                )
            );
        }
    }

    if (!config.docs || typeof config.docs !== "object") {
        issues.push(issue("CONFIG_DOCS_REQUIRED", "docs", "docs must be an object"));
    } else {
        for (const key of ["sources", "exclude", "kinds", "statuses"]) {
            validateStringList(issues, config.docs[key], `docs.${key}`, {
                required: key !== "exclude"
            });
        }
        validatePrefix(
            issues,
            config.docs.idPrefix,
            "docs.idPrefix",
            "CONFIG_DOC_PREFIX_INVALID"
        );
        if (!DOC_LAYOUTS.includes(config.docs.layout)) {
            issues.push(
                issue(
                    "CONFIG_DOC_LAYOUT_INVALID",
                    "docs.layout",
                    `docs.layout must be one of: ${DOC_LAYOUTS.join(", ")}`
                )
            );
        }
        if (
            Array.isArray(config.docs.kinds) &&
            !config.docs.kinds.includes(config.docs.defaultKind)
        ) {
            issues.push(
                issue(
                    "CONFIG_DOC_DEFAULT_KIND_INVALID",
                    "docs.defaultKind",
                    "docs.defaultKind must be included in docs.kinds"
                )
            );
        }
        if (
            Array.isArray(config.docs.statuses) &&
            !config.docs.statuses.includes(config.docs.defaultStatus)
        ) {
            issues.push(
                issue(
                    "CONFIG_DOC_DEFAULT_STATUS_INVALID",
                    "docs.defaultStatus",
                    "docs.defaultStatus must be included in docs.statuses"
                )
            );
        }
        if (
            !Number.isInteger(config.docs.reviewIntervalDays) ||
            config.docs.reviewIntervalDays < 0
        ) {
            issues.push(
                issue(
                    "CONFIG_DOC_REVIEW_INTERVAL_INVALID",
                    "docs.reviewIntervalDays",
                    "docs.reviewIntervalDays must be a non-negative integer"
                )
            );
        }
        if (
            !Number.isInteger(config.docs.maxFileBytes) ||
            config.docs.maxFileBytes < 1024
        ) {
            issues.push(
                issue(
                    "CONFIG_DOC_MAX_FILE_BYTES_INVALID",
                    "docs.maxFileBytes",
                    "docs.maxFileBytes must be an integer of at least 1024"
                )
            );
        }
    }

    if (!config.changelog || typeof config.changelog !== "object") {
        issues.push(
            issue(
                "CONFIG_CHANGELOG_REQUIRED",
                "changelog",
                "changelog must be an object"
            )
        );
    } else {
        validatePrefix(
            issues,
            config.changelog.idPrefix,
            "changelog.idPrefix",
            "CONFIG_CHANGELOG_PREFIX_INVALID"
        );
        validatePrefix(
            issues,
            config.changelog.releasePrefix,
            "changelog.releasePrefix",
            "CONFIG_RELEASE_PREFIX_INVALID"
        );
        validateStringList(issues, config.changelog.types, "changelog.types");
        validateStringList(
            issues,
            config.changelog.visibilities,
            "changelog.visibilities"
        );
        if (
            Array.isArray(config.changelog.types) &&
            !config.changelog.types.includes(config.changelog.defaultType)
        ) {
            issues.push(
                issue(
                    "CONFIG_CHANGELOG_DEFAULT_TYPE_INVALID",
                    "changelog.defaultType",
                    "changelog.defaultType must be included in changelog.types"
                )
            );
        }
        if (
            Array.isArray(config.changelog.visibilities) &&
            !config.changelog.visibilities.includes(
                config.changelog.defaultVisibility
            )
        ) {
            issues.push(
                issue(
                    "CONFIG_CHANGELOG_DEFAULT_VISIBILITY_INVALID",
                    "changelog.defaultVisibility",
                    "changelog.defaultVisibility must be included in changelog.visibilities"
                )
            );
        }
        if (!["semver", "calendar", "freeform"].includes(config.changelog.releaseStrategy)) {
            issues.push(
                issue(
                    "CONFIG_RELEASE_STRATEGY_INVALID",
                    "changelog.releaseStrategy",
                    "changelog.releaseStrategy must be semver, calendar or freeform"
                )
            );
        }
    }

    if (!config.memory || typeof config.memory !== "object") {
        issues.push(
            issue("CONFIG_MEMORY_REQUIRED", "memory", "memory must be an object")
        );
    } else {
        validateStringList(issues, config.memory.collections, "memory.collections");
        const unsupported = Array.isArray(config.memory.collections)
            ? config.memory.collections.filter(
                  (collection) => !MEMORY_DEFINITIONS[collection]
              )
            : [];
        if (unsupported.length) {
            issues.push(
                issue(
                    "CONFIG_MEMORY_COLLECTION_UNSUPPORTED",
                    "memory.collections",
                    `Unsupported memory collections: ${unsupported.join(", ")}`
                )
            );
        }
    }

    if (!config.agents || typeof config.agents !== "object") {
        issues.push(
            issue("CONFIG_AGENTS_REQUIRED", "agents", "agents must be an object")
        );
    } else {
        validateStringList(issues, config.agents.targets, "agents.targets", {
            required: false
        });
        const unsupported = Array.isArray(config.agents.targets)
            ? config.agents.targets.filter((target) => !AGENT_TARGET_IDS.includes(target))
            : [];
        if (unsupported.length) {
            issues.push(
                issue(
                    "CONFIG_AGENT_TARGET_UNSUPPORTED",
                    "agents.targets",
                    `Unsupported agent targets: ${unsupported.join(", ")}`
                )
            );
        }
        for (const [key, value] of [
            ["agents.canonicalInstructions", config.agents.canonicalInstructions],
            ["agents.workflowsPath", config.agents.workflowsPath]
        ]) {
            if (typeof value !== "string" || !value.trim()) {
                issues.push(issue("CONFIG_AGENT_PATH_INVALID", key, `${key} must be a non-empty string`));
            }
        }
    }

    if (!config.ci || typeof config.ci !== "object") {
        issues.push(issue("CONFIG_CI_REQUIRED", "ci", "ci must be an object"));
    } else {
        validateStringList(issues, config.ci.targets, "ci.targets", {
            required: false
        });
        const unsupported = Array.isArray(config.ci.targets)
            ? config.ci.targets.filter((target) => !CI_TARGET_IDS.includes(target))
            : [];
        if (unsupported.length) {
            issues.push(
                issue(
                    "CONFIG_CI_TARGET_UNSUPPORTED",
                    "ci.targets",
                    `Unsupported CI targets: ${unsupported.join(", ")}`
                )
            );
        }
        if (!/^\d+(?:\.\d+)?$/.test(String(config.ci.nodeVersion || ""))) {
            issues.push(
                issue(
                    "CONFIG_CI_NODE_VERSION_INVALID",
                    "ci.nodeVersion",
                    "ci.nodeVersion must be a Node major or major.minor version"
                )
            );
        }
    }

    if (!config.mcp || typeof config.mcp !== "object") {
        issues.push(issue("CONFIG_MCP_REQUIRED", "mcp", "mcp must be an object"));
    } else {
        if (typeof config.mcp.enabled !== "boolean" || typeof config.mcp.allowMutations !== "boolean") {
            issues.push(
                issue(
                    "CONFIG_MCP_BOOLEAN_INVALID",
                    "mcp",
                    "mcp.enabled and mcp.allowMutations must be booleans"
                )
            );
        }
        if (config.mcp.transport !== "stdio") {
            issues.push(
                issue(
                    "CONFIG_MCP_TRANSPORT_INVALID",
                    "mcp.transport",
                    "mcp.transport must be stdio in schema v2"
                )
            );
        }
        for (const [key, value, minimum, maximum] of [
            ["mcp.resourcePageSize", config.mcp.resourcePageSize, 1, 500],
            ["mcp.maxMessageBytes", config.mcp.maxMessageBytes, 1024, 16 * 1024 * 1024],
            ["mcp.maxToolResultBytes", config.mcp.maxToolResultBytes, 1024, 16 * 1024 * 1024]
        ]) {
            if (!Number.isInteger(value) || value < minimum || value > maximum) {
                issues.push(
                    issue(
                        "CONFIG_MCP_LIMIT_INVALID",
                        key,
                        `${key} must be an integer between ${minimum} and ${maximum}`
                    )
                );
            }
        }
    }

    if (!config.search || typeof config.search !== "object") {
        issues.push(
            issue("CONFIG_SEARCH_REQUIRED", "search", "search must be an object")
        );
    } else {
        if (
            config.search.provider !== null &&
            (typeof config.search.provider !== "string" ||
                !config.search.provider.trim())
        ) {
            issues.push(
                issue(
                    "CONFIG_SEARCH_PROVIDER_INVALID",
                    "search.provider",
                    "search.provider must be null or a non-empty integration id"
                )
            );
        }
        if (
            !Number.isFinite(config.search.semanticWeight) ||
            config.search.semanticWeight < 0 ||
            config.search.semanticWeight > 1
        ) {
            issues.push(
                issue(
                    "CONFIG_SEARCH_WEIGHT_INVALID",
                    "search.semanticWeight",
                    "search.semanticWeight must be between 0 and 1"
                )
            );
        }
        if (
            !Number.isInteger(config.search.maxProviderRecords) ||
            config.search.maxProviderRecords < 1 ||
            config.search.maxProviderRecords > 5000
        ) {
            issues.push(
                issue(
                    "CONFIG_SEARCH_PROVIDER_LIMIT_INVALID",
                    "search.maxProviderRecords",
                    "search.maxProviderRecords must be an integer between 1 and 5000"
                )
            );
        }
    }

    if (
        !config.ui ||
        !Number.isInteger(config.ui.port) ||
        config.ui.port < 0 ||
        config.ui.port > 65535
    ) {
        issues.push(
            issue(
                "CONFIG_UI_PORT_INVALID",
                "ui.port",
                "ui.port must be an integer between 0 and 65535"
            )
        );
    }
    return issues;
}

export function assertValidProjectConfig(config: any): ProjectConfig {
    const issues = validateProjectConfig(config);
    if (issues.length) {
        const first = issues[0];
        throw new ConfigError(first.code, first.message, { issues });
    }
    return config as ProjectConfig;
}
