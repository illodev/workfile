import { dirname, join, parse, resolve } from "node:path";
import { exists } from "../core/fs-utils.js";


/**
 * The nearest ancestor holding a workspace marker, or `null`.
 *
 * Returning the working directory when nothing is found — which is what this
 * did — meant any command run outside a workspace quietly created a second
 * `.project/` tree wherever it happened to be: the cards were written, `doctor`
 * reported everything fine, and the work was invisible. `git` answers "not a
 * repository" for the same reason.
 */
export async function discoverWorkspaceRoot(cwd = process.cwd()) {
    let current = resolve(cwd);
    const root = parse(current).root;
    while (true) {
        if (await isWorkspaceRoot(current)) return current;
        if (current === root) return null;
        current = dirname(current);
    }
}

/**
 * Whether this exact directory is a workspace, without walking anywhere.
 *
 * The same two markers the walk above looks for, extracted so the rule is
 * written once. `--root` needed it: `loadWorkspace({ root })` took the directory
 * as given and checked nothing, so `doctor --root packages/workfile` reported
 * six missing-instruction issues, exited 0, and indexed that package's `docs/`
 * as the workspace's documents — a clean, empty, believable answer from a
 * directory that is not a workspace at all (T-0160).
 *
 * Deliberately not a walk. `--root` is an assertion by the caller, and quietly
 * resolving it to a parent would be a second surprise rather than a fix.
 */
export async function isWorkspaceRoot(directory: string) {
    const current = resolve(directory);
    if (await exists(join(current, "project.config.mjs"))) return true;
    return exists(join(current, ".project", "VERSION"));
}
