import { ValidationError } from "../../core/errors.js";

export function requiredString(value, name) {
    if (typeof value !== "string" || !value.trim()) {
        throw new ValidationError(
            "MCP_ARGUMENT_REQUIRED",
            `${name} must be a non-empty string.`,
            { argument: name }
        );
    }
    return value.trim();
}

export function optionalString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function stringList(value, name) {
    if (value == null) return undefined;
    if (!Array.isArray(value)) {
        throw new ValidationError(
            "MCP_ARGUMENT_INVALID",
            `${name} must be an array of strings.`,
            { argument: name }
        );
    }
    const values = value.map((item) => requiredString(item, name));
    return [...new Set(values)];
}

export function boundedInteger(value, { name, fallback, minimum = 1, maximum = 500 }) {
    if (value == null) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new ValidationError(
            "MCP_ARGUMENT_INVALID",
            `${name} must be an integer between ${minimum} and ${maximum}.`,
            { argument: name, value }
        );
    }
    return parsed;
}

export function plainObject(value, name, fallback: any = {}) {
    if (value == null) return fallback;
    if (typeof value !== "object" || Array.isArray(value)) {
        throw new ValidationError(
            "MCP_ARGUMENT_INVALID",
            `${name} must be an object.`,
            { argument: name }
        );
    }
    return value;
}
