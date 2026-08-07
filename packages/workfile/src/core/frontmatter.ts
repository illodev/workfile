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
    const items: string[] = [];
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
 *  - `records` — a block sequence whose items are mappings one level deep.
 *  - `mapping` — a mapping one level deep.
 *  - `literal` / `folded` — `summary: |` and `summary: >` block scalars.
 *  - `opaque`  — anything else this codec will not rewrite.
 *
 * The style is remembered so a patch re-emits the key the way the author wrote
 * it. Rewriting a block list as a flow list is valid YAML but would show up as
 * a diff in every file the tool touches.
 */
export type FrontmatterStyle =
    | "flow"
    | "block"
    | "records"
    | "mapping"
    | "literal"
    | "folded"
    | "opaque";

const KEY_LINE = /^([A-Za-z_][\w.-]*):(.*)$/;
const BLOCK_ITEM = /^(\s+)-\s?(.*)$/;

/**
 * Trailing newlines removed without a regex.
 *
 * `replace(/\n+$/, "")` retries the anchored `+` from every start position, so a
 * value that ends in anything other than a newline costs O(N²) — and this one is
 * applied to a *body*, which nothing caps. A card title is refused past 80
 * characters, so the same shape in the slug helpers is quadratic over a bounded
 * input; a body read from `--body-file` is bounded by the disk. Found while
 * writing the rule for T-0224, not by CodeQL, which reported only the copy whose
 * taint it could follow.
 */
function stripTrailingNewlines(value: string): string {
    let end = value.length;
    while (end > 0 && value[end - 1] === "\n") end -= 1;
    return end === value.length ? value : value.slice(0, end);
}

const BLOCK_SCALAR = /^([|>])([+-]?\d*)\s*$/;
/** `  - id: gate-test` — the line that opens one record in a `records` block. */
const RECORD_ITEM = /^(\s+)-\s+([A-Za-z_][\w.-]*):\s*(.*)$/;
/** `    run: pnpm test` — a field of the record above it, or of a `mapping`. */
const RECORD_FIELD = /^(\s+)([A-Za-z_][\w.-]*):\s*(.*)$/;

/**
 * Reads one `key: value` field into `target`, or refuses the whole structure.
 *
 * Refusing is the point. A field with no inline value opens a level this codec
 * cannot hold, and a repeated key is a document whose meaning depends on which
 * one wins — both are shapes where guessing would rewrite somebody's file into
 * something they did not write. The caller turns a `false` here into `opaque`,
 * which is the pre-existing behaviour for everything nested.
 *
 * The value is read by its shape, not by its name: `listKeys` says which
 * top-level keys are lists, and there is no equivalent vocabulary one level
 * down. `[a, b]` is a list because it is written as one, which is also what
 * makes the round trip symmetric.
 */
function readField(target: Record<string, any>, key: string, raw: string) {
    if (key in target) return false;
    const text = raw.trim();
    if (!text) return false;
    target[key] =
        text.startsWith("[") && text.endsWith("]")
            ? splitListItems(text.slice(1, -1))
                  .map((item) => unquote(item.trim()))
                  .filter(Boolean)
            : unquote(text);
    return true;
}

/**
 * A block sequence of mappings, or `null` when the lines are not one.
 *
 * Indentation is checked exactly rather than loosely, because the shape this
 * has to refuse looks almost identical to the shape it accepts:
 *
 * ```yaml
 * verify:
 *     - id: gate-test
 *       criteria:
 *         - sha256:ab12…
 * ```
 *
 * That last line is a nested sequence, and read leniently it parses as a second
 * record with the key `sha256` — a silent corruption of the file on the next
 * write. Its indentation does not match the item column, and its `criteria:`
 * parent carries no inline value, so both checks catch it independently.
 *
 * At least one continuation line is required, which is what keeps this style
 * disjoint from `block`: a sequence whose every line is a bare item is a list
 * of strings and stays one, even when those strings contain a colon.
 */
function readRecords(meaningful: string[]) {
    const opener = meaningful[0].match(RECORD_ITEM);
    if (!opener) return null;
    const indent = opener[1];
    const fieldIndent = `${indent}  `;
    const value: Array<Record<string, any>> = [];
    let fields = 0;
    for (const line of meaningful) {
        const item = line.match(RECORD_ITEM);
        if (item && item[1] === indent) {
            const record: Record<string, any> = {};
            if (!readField(record, item[2], item[3])) return null;
            value.push(record);
            continue;
        }
        const field = line.match(RECORD_FIELD);
        if (!field || field[1] !== fieldIndent || !value.length) return null;
        if (!readField(value[value.length - 1], field[2], field[3])) return null;
        fields += 1;
    }
    return fields ? { indent, value } : null;
}

/**
 * The two nested shapes this codec holds, tried in order, or `null` for the
 * many it does not. A block sequence and a mapping cannot both match, so the
 * order between them is a formality rather than a precedence rule.
 */
function readStructured(
    meaningful: string[]
): { style: FrontmatterStyle; indent: string; value: any } | null {
    const records = readRecords(meaningful);
    if (records) return { style: "records", ...records };
    const mapping = readMapping(meaningful);
    return mapping ? { style: "mapping", ...mapping } : null;
}

/** A mapping one level deep, or `null` when the lines are not one. */
function readMapping(meaningful: string[]) {
    const opener = meaningful[0].match(RECORD_FIELD);
    if (!opener) return null;
    const indent = opener[1];
    const value: Record<string, any> = {};
    for (const line of meaningful) {
        if (BLOCK_ITEM.test(line)) return null;
        const field = line.match(RECORD_FIELD);
        if (!field || field[1] !== indent) return null;
        if (!readField(value, field[2], field[3])) return null;
    }
    return { indent, value };
}

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

        // A declared list key is a list of scalars by definition, so it is never
        // offered to the structured readers: `tags:` written as a block sequence
        // must keep parsing as the strings it has always been.
        const structured =
            meaningful.length && inline === "" && !listKeys.has(key)
                ? readStructured(meaningful)
                : null;

        if (meaningful.length && BLOCK_SCALAR.test(inline)) {
            style = inline.startsWith("|") ? "literal" : "folded";
            indent = meaningful[0].match(/^\s*/)[0];
            const text = dedent(block);
            value =
                style === "literal"
                    ? stripTrailingNewlines(text.join("\n"))
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
        } else if (structured) {
            ({ style, value, indent } = structured);
        } else if (meaningful.length) {
            // Anything else this codec does not model — a mapping more than one
            // level deep, a sequence of sequences, a field whose value opens a
            // block. Preserved verbatim on read; refused on patch rather than
            // mangled.
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

/**
 * Swaps a record's body, leaving its frontmatter byte for byte as it was.
 *
 * Four call sites wrote this inline — `changelog patch`, `changelog release
 * --amend`, `doc patch` and `memory patch` — and all four spliced the body
 * directly onto `prefixLength`, which ends at the closing `---` newline. The
 * renderers that *create* those records put a blank line there. So every
 * record was born with one and lost it the first time anything patched its
 * body: a diff line on a write that changed nothing else, on four surfaces,
 * repeated for every record that ever went through a body patch. Twelve
 * records in one consuming repository carried the mark before anyone noticed
 * what was making it.
 *
 * The end-of-line comes from the file rather than from here, the same way
 * `patchFrontmatter` reads it. A CRLF record patched with a hardcoded `\n`
 * ends up mixed, and the one line that differs is the one this function adds.
 */
export function replaceBody(content: string, body: string): string {
    const parsed = requireFrontmatter(content);
    const eol = /\r\n/.test(content.slice(0, parsed.prefixLength)) ? "\r\n" : "\n";
    return `${content.slice(0, parsed.prefixLength)}${eol}${String(body).trim()}${eol}`;
}

/**
 * One `key: value` line inside a nested structure.
 *
 * List-ness is decided by the value, not by the key, which is the inverse of
 * `serializeValue` and has to be: `listKeys` names top-level keys, and the
 * fields one level down have no such vocabulary. Deciding by name here would
 * write `criteria: ["a", "b"]` out as the scalar `"a,b"` — the round trip the
 * spec makes normative, broken by the one call that looks most harmless.
 */
function renderField(key: string, value: unknown): string {
    if (Array.isArray(value)) {
        const items = value.map((item) => quote(String(item), ITEM_NEEDS_QUOTE));
        return `${key}: [${items.join(", ")}]`;
    }
    return `${key}: ${quote(String(value ?? ""), SCALAR_NEEDS_QUOTE)}`;
}

/** A value the codec can hold one level down: a scalar, or a list of them. */
function isFieldValue(value: unknown): boolean {
    if (Array.isArray(value)) {
        return value.every((item) => item == null || typeof item !== "object");
    }
    return value == null || typeof value !== "object";
}

/** A mapping one level deep, with at least one field. */
export function isFlatMapping(value: unknown): boolean {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const fields = Object.values(value as Record<string, unknown>);
    return fields.length > 0 && fields.every(isFieldValue);
}

/** A non-empty list of mappings one level deep. */
export function isRecordList(value: unknown): boolean {
    return (
        Array.isArray(value) && value.length > 0 && value.every(isFlatMapping)
    );
}

function renderEntry(key, value, style, listKeys, indent) {
    if (style === "records") {
        const items = (Array.isArray(value) ? value : [value]) as Array<
            Record<string, unknown>
        >;
        return [
            `${key}:`,
            ...items.flatMap((item) =>
                Object.entries(item).map(
                    ([name, field], at) =>
                        `${indent}${at === 0 ? "- " : "  "}${renderField(name, field)}`
                )
            )
        ];
    }
    if (style === "mapping") {
        return [
            `${key}:`,
            ...Object.entries(value as Record<string, unknown>).map(
                ([name, field]) => `${indent}${renderField(name, field)}`
            )
        ];
    }
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
    if (!isFieldValue(value)) {
        // Object-shaped, but not one of the two nested shapes above — a mapping
        // two levels deep, a list of lists, a list holding one of those.
        // `serializeValue` would answer "[object Object]" and the write would
        // succeed, which is how a record ends up holding a string where its
        // author put a structure.
        throw new ValidationError(
            "RECORD_FRONTMATTER_UNREPRESENTABLE",
            `frontmatter key "${key}" holds a structure this codec cannot write. ` +
                `Nested values go one level deep: a mapping of scalars, or a list of such mappings.`,
            { key }
        );
    }
    return [`${key}: ${serializeValue(key, value, listKeys)}`];
}

/**
 * Renders one frontmatter entry, choosing the style from the value when the
 * caller has none to preserve.
 *
 * `renderCard` and its equivalents build a whole header from scratch by
 * interpolating `serializeValue` per key, which has no way to express a nested
 * value and no way to refuse one. They go through here instead, so a record
 * created with a structure holds that structure rather than "[object Object]".
 */
export function renderFrontmatterEntry(
    key: string,
    value: unknown,
    {
        listKeys = DEFAULT_LIST_KEYS,
        style,
        indent = "  "
    }: { listKeys?: Set<string>; style?: FrontmatterStyle; indent?: string } = {}
): string[] {
    return renderEntry(key, value, style ?? styleForValue(value), listKeys, indent);
}

/**
 * The style a value has to be written in, independent of how it was last read.
 *
 * A key that has never been written has no remembered style, and a key whose
 * value changed shape cannot keep the one it had — the same reason
 * `patchFrontmatter` already drops `block` for a scalar.
 */
function styleForValue(value: unknown): FrontmatterStyle {
    if (isRecordList(value)) return "records";
    if (isFlatMapping(value)) return "mapping";
    return "flow";
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
            (Array.isArray(value) && value.length === 0) ||
            (typeof value === "object" &&
                !Array.isArray(value) &&
                Object.keys(value).length === 0);

        if (entry?.style === "opaque") {
            throw new ValidationError(
                "RECORD_FRONTMATTER_OPAQUE",
                `frontmatter key "${key}" holds a nested structure this codec does not rewrite. ` +
                    `Nested values go one level deep: a mapping of scalars, or a list of such mappings.`,
                { key }
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
        // A nested value picks its own style rather than inheriting one. There
        // is nothing to preserve the first time a key is written, and a value
        // that changed shape has to change with it — `block` above is the same
        // rule, one shape simpler.
        const nested = styleForValue(value);
        if (nested !== "flow" || style === "records" || style === "mapping") {
            style = nested;
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
