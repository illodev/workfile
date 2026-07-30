import { join } from "node:path";

import { exists } from "./fs-utils.js";

/** The bin this package installs. Generated instructions invoke it. */
export const CLI_BIN = "workfile";

/**
 * Lockfile -> manager, in priority order. First match wins, so a repository
 * carrying more than one lockfile resolves deterministically rather than by
 * directory listing order.
 */
const LOCKFILES = Object.freeze([
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"]
]);

/**
 * How each manager runs a bin that lives in the local `node_modules`. This is
 * NOT cosmetic: the generated commands and skills are executed verbatim, and a
 * bare `workfile` only resolves when the package is installed globally. A
 * repository that has it as a devDependency needs the manager's prefix.
 */
const RUNNERS = Object.freeze({
    pnpm: "pnpm",
    yarn: "yarn",
    bun: "bunx",
    npm: "npx"
});

export const DEFAULT_PACKAGE_MANAGER = "npm";

export async function detectPackageManager(root) {
    for (const [file, manager] of LOCKFILES) {
        if (await exists(join(root, file))) return manager;
    }
    return DEFAULT_PACKAGE_MANAGER;
}

/**
 * The command prefix a human or agent should type, e.g. `pnpm workfile`.
 * Falls back to npx for an unknown manager, which is the widest-supported form.
 */
export function cliInvocation(packageManager) {
    const runner = RUNNERS[packageManager] || RUNNERS[DEFAULT_PACKAGE_MANAGER];
    return `${runner} ${CLI_BIN}`;
}
