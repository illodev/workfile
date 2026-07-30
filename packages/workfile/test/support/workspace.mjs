import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildBenchWorkspace } from "../../scripts/bench-workspace.mjs";
import { loadWorkspace, startProjectServer } from "../../dist/src/index.js";

export const fixtureRoot = resolve(
    fileURLToPath(new URL("../fixtures/workspace", import.meta.url))
);

/**
 * A disposable workspace, and its cleanup.
 *
 * The same twelve lines were copied into forty-odd tests: `mkdtemp`, `cp` the
 * fixture, `loadWorkspace`, and a `finally` that removes it. Copies drift —
 * some remembered `force: true`, some did not — and a test that leaks a temp
 * directory is invisible until a machine runs out of inodes.
 *
 * `scale` builds a synthetic corpus instead of copying the golden fixture, for
 * tests that need size rather than specific records.
 */
export async function createTestWorkspace({
    scale = null,
    prefix = "workfile-",
    readOnly = false
} = {}) {
    const root = await mkdtemp(join(tmpdir(), prefix));
    if (scale) await buildBenchWorkspace(root, scale);
    else await cp(fixtureRoot, root, { recursive: true });
    const workspace = await loadWorkspace({ root, readOnly });
    return {
        root,
        workspace,
        cleanup: () => rm(root, { recursive: true, force: true })
    };
}

/**
 * Runs `fn` against a live server and shuts everything down afterwards.
 *
 * The teardown is the point: `startProjectServer` holds watch descriptors and
 * may hold open event streams, and a test that returns early without closing
 * leaves both behind for the rest of the run.
 */
export async function withServer(fn, options = {}) {
    const { root, workspace, cleanup } = await createTestWorkspace(options);
    const server = await startProjectServer(workspace, { port: 0 });
    try {
        return await fn({ server, workspace, root, url: server.url });
    } finally {
        await server.close();
        await cleanup();
    }
}

/** Frontmatter plus a body, for tests that write records by hand. */
export function card(id, fields = {}, body = "Body.") {
    const front = {
        id,
        title: `Card ${id}`,
        status: "backlog",
        type: "task",
        priority: "medium",
        area: "api",
        created: "2026-07-30",
        updated: "2026-07-30",
        ...fields
    };
    return `---\n${Object.entries(front)
        .map(([key, value]) =>
            Array.isArray(value)
                ? `${key}: [${value.join(", ")}]`
                : `${key}: ${value}`
        )
        .join("\n")}\n---\n\n${body}\n`;
}
