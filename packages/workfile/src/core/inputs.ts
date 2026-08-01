/**
 * Option values that must fail loudly rather than filter everything away.
 *
 * A filter given a value it cannot parse has two honest options: refuse, or
 * ignore the filter. It did neither. `--updated-since 2026-7-1` compared as a
 * raw string against `YYYY-MM-DD`, matched nothing, and exited 0 with
 * `"total": 0`; `--limit abc` produced `NaN`, and `slice(NaN, NaN)` returned an
 * empty page under `"total": 3`. Both read to an agent as "nothing here", which
 * is the one answer a broken filter must never give — a wrong result that looks
 * like a valid one is worse than an error, because nothing downstream can tell.
 *
 * Shared by the CLI and the MCP tools so the two surfaces cannot disagree about
 * what a date is.
 */
import { ValidationError } from "./errors.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export interface InputOptions {
    /** How the caller named it: `--updated-since`, or `updatedSince`. */
    label: string;
    /** Error code for this surface: `CLI_OPTION_INVALID`, `MCP_ARGUMENT_INVALID`. */
    code: string;
}

/**
 * A date boundary, normalized to `YYYY-MM-DD`.
 *
 * An RFC 3339 timestamp is accepted and truncated to its date. Records store
 * `updated` as a plain date, so `2026-08-01T10:00:00Z` compared as a string
 * sorts *after* `2026-08-01` and silently dropped everything changed that day —
 * the boundary case a caller is most likely to hit.
 */
export function dateBoundary(value, { label, code }: InputOptions) {
    if (value == null || value === "") return undefined;
    const text = String(value).trim();
    if (DATE.test(text)) return text;
    if (TIMESTAMP.test(text)) return text.slice(0, 10);
    throw new ValidationError(
        code,
        `${label} must be a date as YYYY-MM-DD (an RFC 3339 timestamp is ` +
            `accepted and read as its date); got "${text}".`,
        { option: label, value: text }
    );
}

/**
 * A whole number, refusing what `Number()` would turn into `NaN`.
 *
 * `Number("")` is 0 and `Number(" 3 ")` is 3, which is exactly the leniency
 * that lets a typo through as a number, so the text is matched before it is
 * converted.
 */
export function wholeNumber(
    value,
    { label, code, min = 0, max }: InputOptions & { min?: number; max?: number }
) {
    if (value == null || value === "") return undefined;
    const text = String(value).trim();
    if (!/^-?\d+$/.test(text)) {
        throw new ValidationError(
            code,
            `${label} must be a whole number; got "${text}".`,
            { option: label, value: text }
        );
    }
    const parsed = Number(text);
    if (parsed < min || (max !== undefined && parsed > max)) {
        throw new ValidationError(
            code,
            `${label} must be between ${min} and ${max ?? "∞"}; got ${parsed}.`,
            { option: label, value: parsed }
        );
    }
    return parsed;
}
