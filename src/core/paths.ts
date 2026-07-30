import { readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import { normalizeRepoPath } from "./glob.js";

export interface ReadMarkdownTreeOptions {
    /** File extension to collect. Defaults to `.md`. */
    extension?: string;
    /** Absolute directories to skip (for example a nested card archive). */
    skip?: string[];
}

/**
 * List every Markdown file inside `directory` at any depth.
 *
 * Paths are returned relative to `directory`, always with `/` separators and
 * sorted, so `join(directory, file)` addresses the file again. A missing
 * directory yields an empty list, which keeps every loader tolerant of
 * workspaces that have not created a domain folder yet.
 *
 * Hidden directories (`.cache`, `.git`, ...) and symbolic links are ignored;
 * that keeps the walk finite and prevents caches from being loaded as records.
 */
export async function readMarkdownTree(
    directory: string,
    { extension = ".md", skip = [] }: ReadMarkdownTreeOptions = {}
): Promise<string[]> {
    const skipped = new Set(
        skip.filter(Boolean).map((entry) => resolve(directory, entry))
    );
    const files: string[] = [];
    const walk = async (relativeDirectory: string) => {
        const absolute = relativeDirectory
            ? join(directory, relativeDirectory)
            : directory;
        let entries;
        try {
            entries = await readdir(absolute, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const child = relativeDirectory
                ? `${relativeDirectory}/${entry.name}`
                : entry.name;
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) {
                if (entry.name.startsWith(".")) continue;
                if (skipped.has(resolve(absolute, entry.name))) continue;
                await walk(child);
                continue;
            }
            if (entry.isFile() && entry.name.endsWith(extension)) {
                files.push(child);
            }
        }
    };
    await walk("");
    return files.sort();
}

/**
 * Resolve `candidate` against `root` and return the absolute path only when it
 * stays inside `root`. Returns `null` for absolute paths and `../` escapes.
 *
 * This is the single containment criterion used by workspace configuration and
 * by user-supplied folders.
 */
export function containedPath(root: string, candidate: string): string | null {
    const resolved = resolve(root, normalizeRepoPath(String(candidate ?? "")));
    const rel = relative(root, resolved);
    if (rel.startsWith("..") || isAbsolute(rel)) return null;
    return resolved;
}
