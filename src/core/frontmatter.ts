import { ValidationError } from "./errors.js";

export const DEFAULT_LIST_KEYS = new Set([
    "tags",
    "depends",
    "scope",
    "related",
    "owners",
    "paths",
    "cards",
    "decisions",
    "actions"
]);

const SCALAR_NEEDS_QUOTE = /^$|^["'\s]|\s$|[:#[\]{}]/;
const ITEM_NEEDS_QUOTE = /^$|^["'\s]|\s$|[,:#[\]{}]/;

function quote(value, needsQuote) {
    return needsQuote.test(value) ? JSON.stringify(value) : value;
}

function unquote(value) {
    if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }
    if (
        value.length > 1 &&
        value.startsWith("'") &&
        value.endsWith("'") &&
        !value.slice(1, -1).includes("'")
    ) {
        return value.slice(1, -1);
    }
    return value;
}

function splitListItems(value) {
    const items = [];
    let current = "";
    let quoteChar = null;
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if (quoteChar) {
            if (char === "\\" && index + 1 < value.length) {
                current += char + value[index + 1];
                index += 1;
            } else {
                current += char;
                if (char === quoteChar) quoteChar = null;
            }
        } else if (char === '"' || char === "'") {
            quoteChar = char;
            current += char;
        } else if (char === ",") {
            items.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    items.push(current);
    return items;
}

export function parseValue(key, raw, listKeys = DEFAULT_LIST_KEYS) {
    let value = raw.trim();
    if (listKeys.has(key)) {
        if (value.startsWith("[") && value.endsWith("]")) {
            value = value.slice(1, -1);
        }
        return splitListItems(value)
            .map((item) => unquote(item.trim()))
            .filter(Boolean);
    }
    return unquote(value);
}

export function serializeValue(key, value, listKeys = DEFAULT_LIST_KEYS) {
    if (listKeys.has(key)) {
        const items = Array.isArray(value)
            ? value
            : value == null || value === ""
              ? []
              : [value];
        return `[${items
            .map((item) => quote(String(item), ITEM_NEEDS_QUOTE))
            .join(", ")}]`;
    }
    return quote(String(value ?? ""), SCALAR_NEEDS_QUOTE);
}

/**
 * How a key was written in the source document.
 *
 *  - `flow`    — `tags: [a, b]` or `title: text`, the shape this codec emits.
 *  - `block`   — a YAML block sequence (`tags:` then `  - a`), which is what
 *                Obsidian, `yaml.dump` and most LLMs produce by default.
 *  - `literal` / `folded` — `summary: |` and `summary: >` block scalars.
 *  - `opaque`  — nested mappings and anything else this codec will not rewrite.
 *
 * The style is remembered so a patch re-emits the key the way the author wrote
 * it. Rewriting a block list as a flow list is valid YAML but would show up as
 * a diff in every file the tool touches.
 */
export type FrontmatterStyle =
    | "flow"
    | "block"
    | "literal"
    | "folded"
    | "opaque";

const KEY_LINE = /^([A-Za-z_][\w.-]*):(.*)$/;
const BLOCK_ITEM = /^(\s+)-\s?(.*)$/;
const BLOCK_SCALAR = /^([|>])([+-]?\d*)\s*$/;

function isIndented(line) {
    return /^\s+\S/.test(line);
}

function dedent(lines) {
    const indents = lines
        .filter((line) => line.trim())
        .map((line) => line.match(/^\s*/)[0].length);
    const common = indents.length ? Math.min(...indents) : 0;
    return lines.map((line) => line.slice(common));
}

/**
 * Splits the frontmatter into one entry per top-level key, each covering the
 * full span of lines it owns rather than just the line it starts on.
 *
 * The previous implementation matched `key:` line by line, so a block list read
 * as an empty value and a patch replaced only the first of its lines, leaving
 * the rest orphaned and the document invalid.
 */
function scanEntries(lines, listKeys) {
    const entries = [];
    let index = 0;
    while (index < lines.length) {
        const match = lines[index].match(KEY_LINE);
        if (!match) {
            index += 1;
            continue;
        }
        const [, key, rest] = match;
        const inline = rest.trim();
        const start = index;
        let end = index + 1;
        while (
            end < lines.length &&
            (isIndented(lines[end]) ||
                (lines[end].trim() === "" &&
                    end + 1 < lines.length &&
                    isIndented(lines[end + 1])))
        ) {
            end += 1;
        }
        const block = lines.slice(start + 1, end);
        const meaningful = block.filter((line) => line.trim());

        let style: FrontmatterStyle = "flow";
        let value: any;
        let indent = "  ";

        if (meaningful.length && BLOCK_SCALAR.test(inline)) {
            style = inline.startsWith("|") ? "literal" : "folded";
            indent = meaningful[0].match(/^\s*/)[0];
            const text = dedent(block);
            value =
                style === "literal"
                    ? text.join("\n").replace(/\n+$/, "")
                    : text.join(" ").replace(/\s+/g, " ").trim();
        } else if (
            meaningful.length &&
            inline === "" &&
            meaningful.every((line) => BLOCK_ITEM.test(line))
        ) {
            style = "block";
            indent = meaningful[0].match(BLOCK_ITEM)[1];
            value = meaningful
                .map((line) => unquote(line.match(BLOCK_ITEM)[2].trim()))
                .filter(Boolean);
        } else if (meaningful.length) {
            // A nested mapping, or anything else this codec does not model.
            // Preserved verbatim on read; refused on patch rather than mangled.
            style = "opaque";
            value = block.join("\n");
        } else if (inline !== "" || listKeys.has(key)) {
            value = parseValue(key, rest, listKeys);
        } else {
            index = end;
            continue;
        }

        entries.push({ key, start, end, style, value, indent });
        index = end;
    }
    return entries;
}

export function parseFrontmatter(
    content,
    { listKeys = DEFAULT_LIST_KEYS }: { listKeys?: Set<string> } = {}
) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) return null;
    const lines = match[1].split(/\r?\n/);
    const entries = scanEntries(lines, listKeys);
    const metadata: Record<string, any> = {};
    const styles: Record<string, FrontmatterStyle> = {};
    const ranges: Record<string, [number, number]> = {};
    for (const entry of entries) {
        metadata[entry.key] = entry.value;
        styles[entry.key] = entry.style;
        ranges[entry.key] = [entry.start, entry.end];
    }
    return {
        metadata,
        styles,
        ranges,
        body: content.slice(match[0].length),
        frontmatter: match[1],
        prefixLength: match[0].length
    };
}

/**
 * Frontmatter that the caller has already established must be there.
 *
 * `parseFrontmatter` answers `null` for a file with no `---` block, and four
 * modules read `.prefixLength` or `.body` straight off the result. A card whose
 * header was truncated — an interrupted write, a bad merge, a hand edit that
 * removed one dash — therefore failed as a `TypeError` from the middle of a
 * mutation, with no mention of which file was at fault and a write lock already
 * taken. The condition is the same; only the report changes.
 */
export function requireFrontmatter(content, options: any = {}) {
    const parsed = parseFrontmatter(content, options);
    if (!parsed) {
        throw new ValidationError(
            "RECORD_FRONTMATTER_MISSING",
            `${options.path ? `${options.path} has` : "The record has"} no frontmatter block. Every record starts with a \`---\` header; restore it before editing.`,
            options.path ? { path: options.path } : null
        );
    }
    return parsed;
}

function renderEntry(key, value, style, listKeys, indent) {
    if (style === "block") {
        const items = Array.isArray(value) ? value : [value];
        return [
            `${key}:`,
            ...items.map(
                (item) => `${indent}- ${quote(String(item), ITEM_NEEDS_QUOTE)}`
            )
        ];
    }
    if (style === "literal" || style === "folded") {
        return [
            `${key}: ${style === "literal" ? "|" : ">"}`,
            ...String(value ?? "")
                .split("\n")
                .map((line) => `${indent}${line}`)
        ];
    }
    return [`${key}: ${serializeValue(key, value, listKeys)}`];
}

export function patchFrontmatter(
    content,
    changes,
    {
        listKeys = DEFAULT_LIST_KEYS,
        touchUpdated = true,
        today
    }: {
        listKeys?: Set<string>;
        touchUpdated?: boolean;
        today?: string;
    } = {}
) {
    const parsed = parseFrontmatter(content, { listKeys });
    if (!parsed) throw new Error("frontmatter not found");

    // The body keeps whatever line ending it already had, so the frontmatter
    // has to match it or the file ends up with two conventions in one document.
    const eol = /\r\n/.test(content.slice(0, parsed.prefixLength)) ? "\r\n" : "\n";
    const lines = parsed.frontmatter.split(/\r?\n/);
    const entries = scanEntries(lines, listKeys);
    const applied = { ...changes };
    if (touchUpdated && !("updated" in applied)) {
        applied.updated = today || new Date().toISOString().slice(0, 10);
    }

    // Edits are collected against the original line numbers and applied from
    // the bottom up, so rewriting a multi-line key cannot shift the ranges of
    // the keys that follow it.
    const edits = [];
    const appended = [];
    for (const [key, value] of Object.entries(applied)) {
        const entry = entries.find((candidate) => candidate.key === key);
        const empty =
            value == null ||
            value === "" ||
            (Array.isArray(value) && value.length === 0);

        if (entry?.style === "opaque") {
            throw new Error(
                `frontmatter key "${key}" holds a nested structure this codec does not rewrite`
            );
        }
        if (empty) {
            if (entry) {
                edits.push({ start: entry.start, end: entry.end, lines: [] });
            }
            continue;
        }

        // Style is preserved, except where the new value cannot wear it: a
        // scalar written into a block sequence goes back to flow.
        let style: FrontmatterStyle = entry?.style ?? "flow";
        if (style === "block" && !Array.isArray(value)) style = "flow";
        if ((style === "literal" || style === "folded") && Array.isArray(value)) {
            style = "flow";
        }

        const rendered = renderEntry(
            key,
            value,
            style,
            listKeys,
            entry?.indent ?? "  "
        );
        if (entry) {
            edits.push({ start: entry.start, end: entry.end, lines: rendered });
        } else {
            appended.push(...rendered);
        }
    }

    const next = [...lines];
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
        next.splice(edit.start, edit.end - edit.start, ...edit.lines);
    }
    next.push(...appended);

    return `---${eol}${next.join(eol)}${eol}---${eol}${content.slice(parsed.prefixLength)}`;
}
