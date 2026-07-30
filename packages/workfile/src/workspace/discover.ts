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
        if (await exists(join(current, "project.config.mjs"))) return current;
        if (await exists(join(current, ".project", "VERSION"))) return current;
        if (current === root) return null;
        current = dirname(current);
    }
}
