import { readdir, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

function escapeRegex(value) {
    return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function compileGlob(pattern) {
    const normalized = String(pattern).replaceAll("\\", "/").replace(/^\.\//, "");
    let source = "^";
    for (let index = 0; index < normalized.length; index += 1) {
        const char = normalized[index];
        if (char === "*") {
            if (normalized[index + 1] === "*") {
                index += 1;
                if (normalized[index + 1] === "/") {
                    index += 1;
                    source += "(?:.*/)?";
                } else {
                    source += ".*";
                }
            } else {
                source += "[^/]*";
            }
        } else if (char === "?") {
            source += "[^/]";
        } else {
            source += escapeRegex(char);
        }
    }
    return new RegExp(`${source}$`);
}

// A walk asks the same handful of patterns once per directory entry, so the
// compiled form is worth keeping. Indexing Fube's docs used to build ~1.3M
// RegExp objects for a config holding seven patterns.
//
// The key set is bounded in practice (patterns come from the config), but
// `discoverFiles` is exported, so the cache is capped rather than trusted.
const GLOB_CACHE_LIMIT = 1024;
const globCache = new Map();

/** Convert the small glob subset used by Workfile into a RegExp.
 * Supports `*`, `?`, and `**`; paths are always matched with `/` separators. */
export function globToRegExp(pattern) {
    const key = String(pattern);
    const cached = globCache.get(key);
    if (cached) return cached;
    const compiled = compileGlob(key);
    if (globCache.size >= GLOB_CACHE_LIMIT) globCache.clear();
    globCache.set(key, compiled);
    return compiled;
}

export function normalizeRepoPath(value) {
    return String(value).split(sep).join("/").replace(/^\.\//, "");
}

export function matchesAnyGlob(path, patterns) {
    const normalized = normalizeRepoPath(path);
    return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}

/** Match one path segment. Only `*` and `?` are meaningful here, and neither
 * crosses `/`, so a segment matcher never needs to look beyond its own name. */
function compileSegment(segment) {
    let source = "^";
    for (const char of segment) {
        if (char === "*") source += "[^/]*";
        else if (char === "?") source += "[^/]";
        else source += escapeRegex(char);
    }
    return new RegExp(`${source}$`);
}

/**
 * Split a pattern into the segment automaton used to prune the walk.
 *
 * `**` is the only construct that can span `/`. As a whole segment it means
 * "zero or more directories" and the automaton models it exactly. Glued to
 * other characters (`docs/**.md`, `a**b`) `globToRegExp` emits a bare `.*`,
 * which swallows arbitrary depth from that point on — so the pattern is marked
 * `unbounded` and every directory is descended. That is the conservative
 * answer, and it is precisely what the walk did for every pattern before.
 */
function prepareSegments(pattern) {
    const normalized = String(pattern).replaceAll("\\", "/").replace(/^\.\//, "");
    const raw = normalized.split("/");
    if (raw.some((segment) => segment.includes("**") && segment !== "**")) {
        return { unbounded: true, segments: [] };
    }
    return {
        unbounded: false,
        segments: raw.map((segment) =>
            segment === "**"
                ? { anyDepth: true, test: null }
                : { anyDepth: false, test: compileSegment(segment) }
        )
    };
}

/** `**` matches zero directories too, so a position sitting on one may also
 * stand just past it. Applied repeatedly for runs like `a/**\/**\/b`. */
function closure(positions: Iterable<number>, segments): Set<number> {
    const reached = new Set<number>();
    const pending = [...positions];
    while (pending.length) {
        const position = pending.pop() as number;
        if (reached.has(position)) continue;
        reached.add(position);
        if (segments[position]?.anyDepth) pending.push(position + 1);
    }
    return reached;
}

/**
 * Can any file *below* this directory match the pattern?
 *
 * Answering by literal prefix does not work: the prefix of `README.md` is
 * empty, which used to authorise descending into every directory in the repo
 * and cost a full-tree walk on the DEFAULT config. Even with that fixed, the
 * prefix of `apps/*​/README.md` is `apps/`, which authorises all of `apps/**`.
 * Walking the pattern segment by segment bounds both cases.
 *
 * Returning `true` is always safe; only `false` can lose files.
 */
function couldContainMatch(directorySegments, prepared) {
    if (prepared.unbounded) return true;
    const { segments } = prepared;
    let positions = closure([0], segments);
    for (const name of directorySegments) {
        const next = new Set<number>();
        for (const position of positions) {
            const segment = segments[position];
            if (!segment) continue;
            // `**` consumes this directory and stays open for the next one.
            if (segment.anyDepth) next.add(position);
            else if (segment.test.test(name)) next.add(position + 1);
        }
        if (next.size === 0) return false;
        positions = closure(next, segments);
    }
    // A position past the last segment means the pattern is already spent:
    // nothing deeper can match it. Any other position still has a segment to
    // consume, which a file inside this directory could supply.
    for (const position of positions) {
        if (position < segments.length) return true;
    }
    return false;
}

/**
 * Would `discoverFiles` walk into this directory for these patterns?
 *
 * Exported for tests. `discoverFiles` only reveals which files it found, and
 * broken pruning finds exactly the same ones — just after reading the entire
 * repository — so the result alone cannot tell the two apart. Deliberately not
 * re-exported from the package barrels: this is a seam, not API.
 */
export function canDescendInto(directory, includePatterns, excludePatterns = []) {
    if (!directory) return true;
    const normalized = normalizeRepoPath(directory);
    // Excludes are evaluated on the directory itself, not only on the entries
    // inside it. `discoverFiles` could afford to filter per entry, but a file
    // watcher places one watch per directory it descends into — so an excluded
    // tree it still walks is a tree it still watches. `.project/.cache` is
    // where locks churn on every write, where the persisted index lives and
    // where agent activity is appended, so watching it is a feedback loop.
    if (
        excludePatterns.length &&
        (matchesAnyGlob(normalized, excludePatterns) ||
            matchesAnyGlob(`${normalized}/`, excludePatterns))
    ) {
        return false;
    }
    const segments = normalized.split("/");
    return includePatterns
        .map(prepareSegments)
        .some((item) => couldContainMatch(segments, item));
}

export async function discoverFiles(
    root,
    {
        include = ["**/*"],
        exclude = [],
        followSymlinks = false,
        onSkippedLink
    }: any = {}
) {
    const results = [];
    const skipped = [];
    const visited = new Set<string>();
    const prepared = include.map(prepareSegments);
    // Segments are carried alongside the path so the automaton never re-splits
    // a parent that has already been walked.
    const queue = [{ path: "", segments: [] }];
    for (let head = 0; head < queue.length; head += 1) {
        const { path: directory, segments: directorySegments } = queue[head];
        const absolute = resolve(root, directory);
        let entries;
        try {
            entries = await readdir(absolute, { withFileTypes: true });
        } catch {
            continue;
        }
        entries.sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            const relativePath = normalizeRepoPath(
                relative(root, resolve(absolute, entry.name))
            );
            if (
                matchesAnyGlob(relativePath, exclude) ||
                (entry.isDirectory() &&
                    matchesAnyGlob(`${relativePath}/`, exclude))
            ) {
                continue;
            }
            // `readdir` reports a symlink as neither a file nor a directory,
            // so every branch below used to miss it and `followSymlinks: true`
            // indexed nothing at all. Resolving the target is the only way to
            // know which branch it belongs in.
            let isDirectory = entry.isDirectory();
            let isFile = entry.isFile();
            if (entry.isSymbolicLink()) {
                if (!followSymlinks) {
                    skipped.push(relativePath);
                    continue;
                }
                let target;
                try {
                    target = await stat(resolve(absolute, entry.name));
                } catch {
                    // A broken link is not an error, just nothing to index.
                    continue;
                }
                // Links can point at an ancestor, so without an identity check
                // a single loop walks forever.
                const identity = `${target.dev}:${target.ino}`;
                if (target.isDirectory()) {
                    if (visited.has(identity)) continue;
                    visited.add(identity);
                }
                isDirectory = target.isDirectory();
                isFile = target.isFile();
            }

            if (isDirectory) {
                const childSegments = [...directorySegments, entry.name];
                if (prepared.some((item) => couldContainMatch(childSegments, item))) {
                    queue.push({ path: relativePath, segments: childSegments });
                }
                continue;
            }
            if (isFile && matchesAnyGlob(relativePath, include)) {
                results.push(relativePath);
            }
        }
    }
    // Links are reported rather than silently dropped: a `docs.sources` glob
    // that only reaches its files through one indexes nothing, and without this
    // the workspace simply looks empty.
    if (skipped.length && typeof onSkippedLink === "function") {
        onSkippedLink(skipped);
    }
    return results;
}
