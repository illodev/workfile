#!/usr/bin/env node
import { resolve } from "node:path";

import {
    createProjectIndexStore,
    createWorkspaceWatcher,
    loadWorkspace,
    startMcpStdioServer
} from "../src/index.js";

function option(name) {
    const index = process.argv.indexOf(name);
    return index === -1 ? null : process.argv[index + 1];
}

const root = resolve(option("--root") || process.cwd());
const readOnly = process.argv.includes("--read-only");

try {
    const workspace = await loadWorkspace({ root, readOnly });
    if (!workspace.config.mcp.enabled) {
        throw Object.assign(new Error("MCP is disabled in project.config.mjs"), {
            code: "MCP_DISABLED"
        });
    }
    const effectiveReadOnly = readOnly || !workspace.config.mcp.allowMutations;
    // A long-lived MCP process keeps one index warm for the whole session. The
    // watcher is what makes that safe: without it the store would either serve
    // a stale index or rebuild on every tool call, which is the trade the old
    // one-second TTL was stuck making.
    const indexStore = createProjectIndexStore(workspace);
    const watcher = createWorkspaceWatcher(workspace, {
        onChange: () => indexStore.invalidate()
    });
    void watcher.start();
    const server = startMcpStdioServer(workspace, {
        readOnly: effectiveReadOnly,
        indexStore
    });
    try {
        await server.closed;
    } finally {
        watcher.close();
    }
} catch (error) {
    process.stderr.write(`${error?.code || "MCP_START_FAILED"}: ${error?.message || error}\n`);
    process.exitCode = 1;
}
