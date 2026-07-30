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
    }
});


export function digestText(value) {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function renderManagedBlock({ kind, version, body, style = "html" }) {
    const marker = STYLES[style];
    if (!marker) throw new TypeError(`Unsupported managed block style: ${style}`);
    const normalized = String(body || "").trimEnd();
    const digest = digestText(normalized);
    const metadata = `kind=${kind} version=${version} digest=${digest}`;
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

export function findManagedBlock(content, kind, preferredStyle) {
    const styles = preferredStyle ? [preferredStyle] : Object.keys(STYLES);
    for (const style of styles) {
        const definition = STYLES[style];
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

export function mergeManagedBlock(existing, block, options: any = {}) {
    const current = findManagedBlock(existing, block.kind, block.style);
    if (current) {
        return `${existing.slice(0, current.start)}${block.text}${existing.slice(current.end)}`;
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

export async function inspectManagedFile({ path, block, label }) {
    if (!(await exists(path))) {
        return {
            path: label,
            status: "missing",
            current: null,
            expected: block.digest
        };
    }
    const content = await readFile(path, "utf8");
    const current = findManagedBlock(content, block.kind, block.style);
    if (!current) {
        return {
            path: label,
            status: "unmanaged",
            current: null,
            expected: block.digest
        };
    }
    const actualDigest = digestText(current.body);
    const metadataDigest = current.metadata.digest || null;
    // The version stamp is information, not part of the decision. Comparing it
    // marked every generated file stale on each package bump even when the
    // content was byte-identical — and the fix is not cosmetic: the Claude Code
    // surface generates roughly twenty of these, so a version bump would have
    // produced twenty false warnings and taught everyone to skip the report.
    const status =
        current.body === block.body && metadataDigest === block.digest
            ? "current"
            : "stale";
    return {
        path: label,
        status,
        current: actualDigest,
        declared: metadataDigest,
        expected: block.digest,
        version: current.metadata.version || null
    };
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
