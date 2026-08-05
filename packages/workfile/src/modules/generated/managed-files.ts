import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, relative } from "node:path";

import { ConflictError } from "../../core/errors.js";
import { writeFileAtomic } from "../../core/filesystem.js";
import { exists } from "../../core/fs-utils.js";

const STYLES = Object.freeze({
    html: {
        begin: (metadata) => `<!-- workfile:begin ${metadata} -->`,
        end: "<!-- workfile:end -->",
        pattern: /<!-- workfile:begin ([^\n]+) -->/g
    },
    hash: {
        begin: (metadata) => `# workfile:begin ${metadata}`,
        end: "# workfile:end",
        pattern: /^# workfile:begin ([^\n]+)$/gm
    },
    /**
     * One line inside the YAML frontmatter, and no closing marker.
     *
     * A pair cannot be used here: the opening marker would have to sit above
     * the frontmatter, and frontmatter is only frontmatter at byte 0. A file
     * with anything ahead of the fence has no frontmatter at all — every field
     * is silently dropped, which is what shipped until this style existed.
     *
     * So the block is the whole file and the marker moves inside it, as a YAML
     * comment that parsers discard. That keeps the digest over the frontmatter
     * as well as the body, which `preamble` — the way the Cursor target avoids
     * the same problem — does not: a preamble is written once at creation and
     * never updated, which is fine for two constant lines and wrong for
     * frontmatter that is generated and does change.
     */
    frontmatter: {
        line: (metadata) => `# workfile ${metadata}`,
        pattern: /^# workfile (kind=[^\n]+)$/m
    }
});

type PairStyle = {
    begin: (metadata: string) => string;
    end: string;
    pattern: RegExp;
};

/** Pairs bracket a region; a line-style block is the file it sits in. */
function isPairStyle(style): style is PairStyle {
    return typeof style.end === "string";
}


function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function digestText(value) {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

/**
 * Drops the marker lines, keeping everything between and around them.
 *
 * Needed whenever a managed file's bytes are embedded inside another managed
 * block. Markers do not nest: `findManagedBlock` scans forward for the first
 * `end`, so an inner one closes the outer block early. The reader then digests
 * a truncated body, it never matches what was written, and the file reports
 * stale on every check with no edit that can fix it.
 *
 * Stripping lines rather than extracting the block on purpose — a file may
 * carry the author's own prose outside the markers, and that is not ours to
 * discard.
 */
function stripMarkerLines(content) {
    // A byte no marker can contain. A space would not do: the rendered
    // marker already has them, and the first sits inside `<!--`.
    const SLOT = "\u0000";
    let text = String(content ?? "");
    for (const style of Object.values(STYLES)) {
        const markers = isPairStyle(style)
            ? [
                  escapeRegExp(style.begin(SLOT)).replace(SLOT, "[^\\n]*"),
                  escapeRegExp(style.end)
              ]
            : [escapeRegExp(style.line(SLOT)).replace(SLOT, "[^\\n]*")];
        for (const marker of markers) {
            text = text.replace(
                new RegExp(`^[ \\t]*${marker}[ \\t]*\\r?\\n?`, "gm"),
                ""
            );
        }
    }
    return text;
}

export function stripManagedMarkers(content) {
    return stripMarkerLines(content).trim();
}

/** The `[start, end)` span of every complete block, any kind, any style. */
function completeBlockRanges(content) {
    const ranges: Array<[number, number]> = [];
    for (const definition of Object.values(STYLES)) {
        // A line-style block spans its whole file, so it has no orphans to
        // sweep around and nothing to contribute here.
        if (!isPairStyle(definition)) continue;
        definition.pattern.lastIndex = 0;
        let match;
        while ((match = definition.pattern.exec(content))) {
            const bodyStart = definition.pattern.lastIndex;
            const endMarkerIndex = content.indexOf(definition.end, bodyStart);
            if (endMarkerIndex === -1) continue;
            const end = endMarkerIndex + definition.end.length;
            ranges.push([match.index, end]);
            definition.pattern.lastIndex = end;
        }
    }
    return ranges.sort((left, right) => left[0] - right[0]);
}

/**
 * Removes marker lines that sit outside every complete block.
 *
 * Skills written by 0.1.0/0.1.1 embedded the protocol's own marker pair in
 * their body; syncing over such a file replaced up to the FIRST `end` and left
 * the rest as debris — this repo's own SKILL.md had accumulated seven orphan
 * `end` lines, invisible to `check`, which only reads the first block. A
 * marker line is never legitimate user content, so anything outside a
 * complete block is ours to sweep.
 */
export function sweepOrphanMarkers(content) {
    const text = String(content ?? "");
    const ranges = completeBlockRanges(text);
    let cursor = 0;
    let result = "";
    for (const [start, end] of ranges) {
        if (start < cursor) continue;
        result += stripMarkerLines(text.slice(cursor, start));
        result += text.slice(start, end);
        cursor = end;
    }
    result += stripMarkerLines(text.slice(cursor));
    return result;
}

export function renderManagedBlock({ kind, version, body, style = "html" }) {
    const marker = STYLES[style];
    if (!marker) throw new TypeError(`Unsupported managed block style: ${style}`);
    const normalized = String(body || "").trimEnd();
    const digest = digestText(normalized);
    const metadata = `kind=${kind} version=${version} digest=${digest}`;
    if (!isPairStyle(marker)) {
        // Inserted below the opening fence, so the fence keeps byte 0 and the
        // digest still covers every frontmatter field.
        if (!normalized.startsWith("---\n")) {
            throw new TypeError(
                `A ${style} block needs YAML frontmatter at byte 0: ${kind}`
            );
        }
        return {
            kind,
            version,
            digest,
            style,
            body: normalized,
            text: `---\n${marker.line(metadata)}\n${normalized.slice(4)}`
        };
    }
    return {
        kind,
        version,
        digest,
        style,
        body: normalized,
        text: `${marker.begin(metadata)}\n${normalized}\n${marker.end}`
    };
}

function parseMetadata(value) {
    return Object.fromEntries(
        value
            .split(/\s+/)
            .map((item) => item.split("="))
            .filter((parts) => parts.length === 2)
    );
}

export function findManagedBlock(content, kind, preferredStyle?) {
    const styles = preferredStyle ? [preferredStyle] : Object.keys(STYLES);
    for (const style of styles) {
        const definition = STYLES[style];
        if (!isPairStyle(definition)) {
            const match = definition.pattern.exec(content);
            if (!match) continue;
            const metadata = parseMetadata(match[1]);
            if (kind && metadata.kind !== kind) continue;
            // Exactly the inverse of the insertion, so the body compares byte
            // for byte against what was rendered.
            const lineStart = match.index;
            let lineEnd = lineStart + match[0].length;
            if (content[lineEnd] === "\n") lineEnd += 1;
            return {
                start: 0,
                end: content.length,
                style,
                metadata,
                text: content,
                body: `${content.slice(0, lineStart)}${content.slice(lineEnd)}`.trimEnd()
            };
        }
        definition.pattern.lastIndex = 0;
        let match;
        while ((match = definition.pattern.exec(content))) {
            const metadata = parseMetadata(match[1]);
            const start = match.index;
            const bodyStart = definition.pattern.lastIndex;
            const endMarkerIndex = content.indexOf(definition.end, bodyStart);
            if (endMarkerIndex === -1) continue;
            const end = endMarkerIndex + definition.end.length;
            if (!kind || metadata.kind === kind) {
                return {
                    start,
                    end,
                    style,
                    metadata,
                    text: content.slice(start, end),
                    body: content.slice(bodyStart, endMarkerIndex).replace(/^\n|\n$/g, "")
                };
            }
            definition.pattern.lastIndex = end;
        }
    }
    return null;
}

/**
 * The final byte, which no digest here covers.
 *
 * `renderManagedBlock` digests `trimEnd()`-ed bytes deliberately: that is what
 * keeps a file stable when an editor adds or drops a blank line at the end,
 * which editors do. The cost is that the trailing newline sits outside the
 * comparison entirely — a file that lost it merges back into itself, the write
 * path sees `before === after` and reports `unchanged`, and every check calls
 * it current forever. Five files in this repository were in that state.
 *
 * So the byte is settled beside the digest rather than inside it: normalised
 * here on every write, and asserted separately on read.
 */
function endWithNewline(text) {
    return text.endsWith("\n") ? text : `${text}\n`;
}

export function mergeManagedBlock(existing, block, options: any = {}) {
    return endWithNewline(mergeManagedText(existing, block, options));
}

function mergeManagedText(existing, block, options) {
    const pair = isPairStyle(STYLES[block.style]);
    // A file installed before its kind moved to a line-style block still
    // carries the old pair. Finding it under any style is what migrates the
    // file on the next sync, instead of refusing it as unmanaged.
    const current =
        findManagedBlock(existing, block.kind, block.style) ??
        (pair ? null : findManagedBlock(existing, block.kind));
    if (current) {
        const merged = `${existing.slice(0, current.start)}${block.text}${existing.slice(current.end)}`;
        // Swept after the merge so debris from the nested-marker era heals on
        // the next sync instead of surviving every upgrade. Not for a
        // line-style block: it is the whole file, and its marker sits inside
        // the frontmatter where the sweep would read it as debris.
        return pair ? sweepOrphanMarkers(merged) : merged;
    }
    if (options.requireMarker && existing.trim()) {
        if (!options.force) {
            throw new ConflictError(
                "GENERATED_FILE_UNMANAGED",
                `Refusing to overwrite an unmanaged generated file: ${options.label || "file"}`,
                { path: options.label }
            );
        }
        const preamble = options.preamble
            ? `${options.preamble.trimEnd()}\n`
            : "";
        return `${preamble}${block.text}\n`;
    }
    const preamble = options.preamble ? `${options.preamble.trimEnd()}\n` : "";
    if (!existing.trim()) return `${preamble}${block.text}\n`;
    return `${existing.trimEnd()}\n\n${block.text}\n`;
}

export type ManagedFileReport = {
    path: string;
    /**
     * `unreachable` is not about a file's contents but about whether a command
     * it names can be run. A generated file can say exactly what an install
     * would write and still describe a hook that does not exist, and those are
     * two different repairs.
     */
    status: "missing" | "unmanaged" | "current" | "stale" | "unreachable";
    /** Which comparison failed, or what could not be resolved. */
    reason?: string | null;
    current?: string | null;
    declared?: string | null;
    expected?: string | null;
    version?: string | null;
};

export async function inspectManagedFile({
    path,
    block,
    label
}): Promise<ManagedFileReport> {
    if (!(await exists(path))) {
        return {
            path: label,
            status: "missing",
            reason: null,
            current: null,
            expected: block.digest
        };
    }
    const content = await readFile(path, "utf8");
    const current =
        findManagedBlock(content, block.kind, block.style) ??
        (isPairStyle(STYLES[block.style])
            ? null
            : findManagedBlock(content, block.kind));
    if (!current) {
        return {
            path: label,
            status: "unmanaged",
            reason: null,
            current: null,
            expected: block.digest
        };
    }
    const actualDigest = digestText(current.body);
    const metadataDigest = current.metadata.digest || null;
    const reason = stalenessReason(current, block, content);
    return {
        path: label,
        status: reason ? "stale" : "current",
        reason,
        current: actualDigest,
        declared: metadataDigest,
        expected: block.digest,
        version: current.metadata.version || null
    };
}

/**
 * What makes this file not current, or `null` if nothing does.
 *
 * Named rather than left as a bare boolean, because one of these reasons is
 * invisible from the outside: a file whose block matches byte for byte and
 * whose digest agrees is stale over a byte that no digest covers. A report
 * that says `stale` with nothing further to say is what sent an external
 * field report looking for the fault in the generator, where it was not.
 *
 * The version stamp is information, not part of the decision. Comparing it
 * marked every generated file stale on each package bump even when the content
 * was byte-identical — and the fix is not cosmetic: the Claude Code surface
 * generates roughly twenty of these, so a version bump would have produced
 * twenty false warnings and taught everyone to skip the report. The style is
 * compared because it is part of what is managed, and because an old
 * pair-style file wraps exactly the same bytes: without this, a file whose
 * frontmatter is inert — the marker still above the fence — reports current,
 * since both the body and the digest match.
 */
function stalenessReason(current, block, content): string | null {
    if (current.style !== block.style) return "style";
    if (current.body !== block.body) return "body";
    if ((current.metadata.digest || null) !== block.digest) return "digest";
    if (!content.endsWith("\n")) return "trailing-newline";
    return null;
}

export async function syncManagedFile({
    path,
    block,
    label,
    preamble = "",
    requireMarker = false,
    force = false,
    dryRun = false
}) {
    const fileExists = await exists(path);
    const before = fileExists ? await readFile(path, "utf8") : "";
    const after = mergeManagedBlock(before, block, {
        label,
        preamble,
        requireMarker,
        force
    });
    const status = !fileExists
        ? "created"
        : before === after
          ? "unchanged"
          : "updated";
    if (!dryRun && status !== "unchanged") {
        await mkdir(dirname(path), { recursive: true });
        await writeFileAtomic(path, after);
    }
    return { path: label, status, digest: block.digest };
}

export function relativeLabel(root, path) {
    return relative(root, path).replaceAll("\\", "/");
}
