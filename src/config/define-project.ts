import { DEFAULT_CONFIG } from "./defaults.js";
import { assertValidProjectConfig } from "./validate-config.js";
import type { ProjectConfig, ProjectConfigInput } from "../types.js";

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function merge(base: any, override: any): any {
    if (!isObject(base) || !isObject(override)) return structuredClone(override);
    const result = structuredClone(base);
    for (const [key, value] of Object.entries(override)) {
        result[key] = isObject(value) && isObject(result[key])
            ? merge(result[key], value)
            : structuredClone(value);
    }
    return result;
}

export function defineProject(input: ProjectConfigInput = {}): ProjectConfig {
    const config = merge(DEFAULT_CONFIG, input) as ProjectConfig;
    if (!config.name || !String(config.name).trim()) {
        config.name = "Unnamed project";
    }
    return assertValidProjectConfig(config);
}
